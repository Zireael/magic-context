// Upgrade regressions deliberately assert the cache contract, not the implementation's
// approved next-normal-pass exception. The previous adapter omitted result attachments.
fn attachment_review_fixture() -> (Vec<serde_json::Value>, Vec<CkIngressMessage>) {
    let native = vec![
        json!({"info": {"id": "prompt", "role": "user"}, "parts": [{"type": "text", "text": "inspect"}]}),
        json!({"info": {"id": "screenshot", "role": "assistant"}, "parts": [{"type": "tool", "tool": "read", "callID": "screen", "state": {
            "status": "completed", "input": {}, "output": "Screenshot",
            "attachments": [{"type": "file", "mime": "image/png", "url": "data:image/png;base64,aW1n", "id": "screen-id"}]
        }}]}),
        json!({"info": {"id": "later", "role": "assistant"}, "parts": [
            {"type": "reasoning", "text": "signed after screenshot", "signature": "sig-later"},
            {"type": "text", "text": "analysis"}
        ]}),
        json!({"info": {"id": "next", "role": "user"}, "parts": [{"type": "text", "text": "continue"}]}),
    ];
    let ingress = crate::codec::decode_opencode(&native).messages;
    (native, ingress)
}

fn attachment_review_request(
    native: &[serde_json::Value],
    messages: Vec<CkIngressMessage>,
    session: &str,
) -> TransformRequest {
    let mut request = opencode_req(session, "cfg0", messages);
    request.provider_id = Some("anthropic".into());
    request.tool_present = true;
    request.model_key = Some("anthropic/claude-sonnet-5-5".into());
    request.native_messages = Some(native.to_vec());
    request
}

fn attachment_review_old_ingress(mut messages: Vec<CkIngressMessage>) -> Vec<CkIngressMessage> {
    let result = &mut messages[1].ck.content[1];
    let ck_wire::CkKind::ToolResult { output, .. } = &mut result.kind else {
        panic!("tool result")
    };
    *output = ck_wire::CkToolOutput::bare(ck_wire::CkOutputKind::Text {
        text: "Screenshot".into(),
    });
    result.mark_modified();
    messages[1].ck.mark_modified();
    messages
}

fn attachment_review_native(
    response: &TransformResponse,
    native: &[serde_json::Value],
) -> Vec<serde_json::Value> {
    let decoded = crate::codec::decode_opencode(native);
    let messages = response
        .messages()
        .iter()
        .map(|message| Deref::deref(message).clone())
        .collect::<Vec<_>>();
    crate::codec::encode_opencode(&messages, &decoded.sidecar, Some("later"))
}

#[test]
fn attachment_review_upgrade_defer_preserves_previously_served_result() {
    let dir = tempfile::tempdir().unwrap();
    let store = store(dir.path());
    let (native, fixed) = attachment_review_fixture();
    let old = attachment_review_request(
        &native,
        attachment_review_old_ingress(fixed.clone()),
        "attachment-review-defer",
    );
    let prime = attachment_review_request(
        &native[..1],
        old.messages[..1].to_vec(),
        "attachment-review-defer",
    );
    run(&store, &prime, &[]);
    let before = run(&store, &old, &[]);
    let upgraded = attachment_review_request(&native, fixed, "attachment-review-defer");
    let after = run(&store, &upgraded, &[]);
    assert_eq!(after.action, "SOFT+");
    assert!(!after.prefix_bust_permitted);
    assert!(
        after
            .messages()
            .iter()
            .find(|m| m.meta.harness_id.as_deref() == Some("later"))
            .unwrap()
            .content
            .iter()
            .any(|b| matches!(b.kind, ck_wire::CkKind::Reasoning { .. })),
        "the later signed block survives this unpermitted edit"
    );
    let before_native = attachment_review_native(&before, &native);
    let after_native = attachment_review_native(&after, &native);
    let result = |messages: &[serde_json::Value]| {
        messages
            .iter()
            .find(|m| m["info"]["id"] == "screenshot")
            .unwrap()
            .clone()
    };
    assert!(
        result(&before_native)["parts"][0]["state"]
            .get("attachments")
            .is_none(),
        "pre-upgrade serving must really have removed the image"
    );
    // The review's length-1 assertion witnessed the defect, not the contract:
    // a deferred upgrade must still serve the attachment-free frozen result.
    assert_eq!(
        result(&after_native),
        result(&before_native),
        "restoring an already-served attachment must wait for prefix-bust permission"
    );
}

#[test]
fn attachment_review_media_only_result_retains_a_taggable_text_carrier() {
    let dir = tempfile::tempdir().unwrap();
    let store = store(dir.path());
    let (mut native, _) = attachment_review_fixture();
    let text_request = attachment_review_request(
        &native,
        crate::codec::decode_opencode(&native).messages,
        "attachment-review-text-control",
    );
    let text_response = run(&store, &text_request, &[]);
    let text_control = serde_json::to_value(
        text_response
            .messages()
            .iter()
            .find(|m| m.meta.harness_id.as_deref() == Some("screenshot"))
            .unwrap(),
    )
    .unwrap();
    assert!(
        text_control["content"][1]["kind"]["output"]["kind"]["blocks"][0]["kind"]["text"]
            .as_str()
            .unwrap()
            .starts_with('§'),
        "the same fixture with text must actually exercise tag admission"
    );
    native[1]["parts"][0]["state"]["output"] = json!("");
    let ingress = crate::codec::decode_opencode(&native).messages;
    let mut old_empty = attachment_review_old_ingress(ingress.clone());
    let ck_wire::CkKind::ToolResult { output, .. } = &mut old_empty[1].ck.content[1].kind else {
        panic!("old result")
    };
    output.kind = ck_wire::CkOutputKind::Text {
        text: String::new(),
    };
    let old_request =
        attachment_review_request(&native, old_empty, "attachment-review-empty-control");
    let old_response = run(&store, &old_request, &[]);
    let old_control = serde_json::to_value(
        old_response
            .messages()
            .iter()
            .find(|m| m.meta.harness_id.as_deref() == Some("screenshot"))
            .unwrap(),
    )
    .unwrap();
    assert!(
        old_control["content"][1]["kind"]["output"]["kind"]["text"]
            .as_str()
            .unwrap()
            .starts_with('§'),
        "the pre-upgrade empty result had a usable tag"
    );
    let request = attachment_review_request(&native, ingress, "attachment-review-media-only");
    let response = run(&store, &request, &[]);
    let screenshot = response
        .messages()
        .iter()
        .find(|m| m.meta.harness_id.as_deref() == Some("screenshot"))
        .unwrap();
    let ck_wire::CkKind::ToolResult { output, .. } = &screenshot.content[1].kind else {
        panic!("result")
    };
    let ck_wire::CkOutputKind::Content { blocks } = &output.kind else {
        panic!("content")
    };
    assert!(
        blocks
            .iter()
            .any(|b| matches!(b.kind, ck_wire::ResultBlockKind::Media { .. })),
        "the image itself must survive"
    );
    assert!(
        blocks.iter().any(
            |b| matches!(&b.kind, ck_wire::ResultBlockKind::Text { text } if text.starts_with('§'))
        ),
        "media-only completed results still need a text-only tag carrier for ctx_reduce"
    );
}

#[test]
fn attachment_review_restored_result_replays_without_a_second_rewrite() {
    let dir = tempfile::tempdir().unwrap();
    let store = store(dir.path());
    let (native, fixed) = attachment_review_fixture();
    let old = attachment_review_request(
        &native,
        attachment_review_old_ingress(fixed.clone()),
        "attachment-review-replay",
    );
    let prime = attachment_review_request(
        &native[..1],
        old.messages[..1].to_vec(),
        "attachment-review-replay",
    );
    run(&store, &prime, &[]);
    run(&store, &old, &[]);
    let mut upgraded = attachment_review_request(&native, fixed, "attachment-review-replay");
    let restored = run(&store, &upgraded, &[]);
    let screenshot_bytes = |response: &TransformResponse, raw: &[serde_json::Value]| {
        let encoded = attachment_review_native(response, raw);
        serde_json::to_vec(
            encoded
                .iter()
                .find(|m| m["info"]["id"] == "screenshot")
                .unwrap(),
        )
        .unwrap()
    };
    let restored_bytes = screenshot_bytes(&restored, &native);
    // Reopen the store as a cold process would; then exercise growing conversation tails.
    drop(store);
    let reopened = crate::transform::tests::store(dir.path());
    for pass in 0..3 {
        let mid = format!("append-{pass}");
        upgraded.messages.push(item(&mid, 5 + pass, "continue"));
        upgraded.native_messages.as_mut().unwrap().push(json!({"info": {"id": mid, "role": "user"}, "parts": [{"type": "text", "text": "continue"}]}));
        let replay = run(&reopened, &upgraded, &[]);
        assert!(!replay.prefix_bust_permitted);
        assert_eq!(
            screenshot_bytes(&replay, upgraded.native_messages.as_ref().unwrap()),
            restored_bytes
        );
    }
}

#[test]
fn attachment_review_upgrade_reaches_normal_serving_with_frozen_assistant_decisions() {
    let dir = tempfile::tempdir().unwrap();
    let store = store(dir.path());
    let (native, fixed) = attachment_review_fixture();
    let old = attachment_review_request(
        &native,
        attachment_review_old_ingress(fixed.clone()),
        "attachment-review-frozen",
    );
    run(&store, &old, &[]);
    let mut loaded = store.load("attachment-review-frozen").unwrap();
    assert!(loaded
        .core
        .frozen_units
        .iter()
        .any(|unit| unit.key == "strip:trailing_blank_strip:screenshot"));
    let upgraded = attachment_review_request(&native, fixed, "attachment-review-frozen");
    let result = transform(&store, &upgraded, &pctx("git:proj", "/nonexistent-docs", 0));
    // The old-adapter-only control below also refreshes the hygiene baseline on
    // its second pass. Reload before this fixture's manual CAS, not the product CAS.
    loaded = store.load("attachment-review-frozen").unwrap();
    loaded.meta.soft_refresh_pending = true;
    store
        .commit(
            "attachment-review-frozen",
            loaded.row_version,
            &loaded.core,
            &loaded.meta,
        )
        .unwrap();
    let bust_retry = transform(&store, &upgraded, &pctx("git:proj", "/nonexistent-docs", 0));
    assert!(result.is_ok() && bust_retry.is_ok(), "an attachment upgrade must reach normal serving, including the next bust: defer={result:?}, bust={bust_retry:?}");
}

#[test]
fn attachment_repair_waits_write_free_then_restores_on_one_bust_after_restart() {
    let dir = tempfile::tempdir().unwrap();
    let store = store(dir.path());
    let (native, fixed) = attachment_review_fixture();
    let session = "attachment-repair-bust";
    let old = attachment_review_request(
        &native,
        attachment_review_old_ingress(fixed.clone()),
        session,
    );
    let before = run(&store, &old, &[]);
    let screenshot_bytes = |response: &TransformResponse| {
        let encoded = attachment_review_native(response, &native);
        serde_json::to_vec(
            encoded
                .iter()
                .find(|m| m["info"]["id"] == "screenshot")
                .unwrap(),
        )
        .unwrap()
    };
    let old_bytes = screenshot_bytes(&before);
    // Let the existing second-pass protection baseline refresh settle first.
    run(&store, &old, &[]);
    let original = store.load(session).unwrap();
    let mut upgraded = attachment_review_request(&native, fixed, session);
    for _ in 0..3 {
        let deferred = run(&store, &upgraded, &[]);
        assert!(!deferred.prefix_bust_permitted);
        assert_eq!(screenshot_bytes(&deferred), old_bytes);
        let now = store.load(session).unwrap();
        assert_eq!(now.row_version, original.row_version);
    }
    drop(store);
    let store = crate::transform::tests::store(dir.path());
    let mut loaded = store.load(session).unwrap();
    loaded.meta.soft_refresh_pending = true;
    store
        .commit(session, loaded.row_version, &loaded.core, &loaded.meta)
        .unwrap();
    let restored = run(&store, &upgraded, &[]);
    assert!(restored.prefix_bust_permitted);
    assert!(
        !restored.reasoning_trim_only,
        "restoring media is a prefix edit, not a reasoning-only trim"
    );
    let encoded = attachment_review_native(&restored, &native);
    let screenshot = encoded
        .iter()
        .find(|m| m["info"]["id"] == "screenshot")
        .unwrap();
    assert_eq!(
        screenshot["parts"][0]["state"]["attachments"],
        native[1]["parts"][0]["state"]["attachments"]
    );
    let bytes = serde_json::to_vec(screenshot).unwrap();
    for pass in 0..3 {
        let mid = format!("new-{pass}");
        upgraded.messages.push(item(&mid, 5 + pass, "continue"));
        upgraded.native_messages.as_mut().unwrap().push(json!({"info": {"id": mid, "role": "user"}, "parts": [{"type": "text", "text": "continue"}]}));
        let deferred = run(&store, &upgraded, &[]);
        assert!(!deferred.prefix_bust_permitted);
        let encoded =
            attachment_review_native(&deferred, upgraded.native_messages.as_ref().unwrap());
        assert_eq!(
            serde_json::to_vec(
                encoded
                    .iter()
                    .find(|m| m["info"]["id"] == "screenshot")
                    .unwrap()
            )
            .unwrap(),
            bytes
        );
    }
}

#[test]
fn attachment_repair_does_not_adopt_unrelated_frozen_identity_drift() {
    let dir = tempfile::tempdir().unwrap();
    let store = store(dir.path());
    let (native, fixed) = attachment_review_fixture();
    let session = "attachment-repair-fence";
    let old = attachment_review_request(
        &native,
        attachment_review_old_ingress(fixed.clone()),
        session,
    );
    run(&store, &old, &[]);
    let mut upgraded = attachment_review_request(&native, fixed, session);
    let ck_wire::CkKind::ToolCall { input, .. } = &mut upgraded.messages[1].ck.content[0].kind
    else {
        panic!("call")
    };
    *input = json!({"changed": true});
    upgraded.messages[1].ck.content[0].mark_modified();
    upgraded.messages[1].ck.mark_modified();
    assert!(matches!(
        transform(&store, &upgraded, &pctx("git:proj", "/nonexistent-docs", 0)),
        Err(TransformError::IdentityDrift(_))
    ));
}

#[test]
fn attachment_repair_old_adapter_control_refreshes_hygiene_on_second_pass() {
    let dir = tempfile::tempdir().unwrap();
    let store = store(dir.path());
    let (native, fixed) = attachment_review_fixture();
    let session = "attachment-old-control";
    let old = attachment_review_request(&native, attachment_review_old_ingress(fixed), session);
    run(&store, &old, &[]);
    let first = store.load(session).unwrap();
    let response = run(&store, &old, &[]);
    let second = store.load(session).unwrap();
    assert!(!response.prefix_bust_permitted);
    assert_ne!(second.row_version, first.row_version);
    assert_eq!(first.core, second.core);
    assert_eq!(
        first.meta.block_identity_by_mid,
        second.meta.block_identity_by_mid
    );
    assert_ne!(
        first.meta.tail_hygiene_baseline,
        second.meta.tail_hygiene_baseline
    );
}
