"""QA edge cases for "recruiter email + AI application email" (added by the QA review).

These tests sit next to test_tailor.py / test_application_email.py and reuse their helpers.
A test marked xfail(strict=True) describes a KNOWN BUG: it passes as "expected failure"
and turns red as soon as the bug is fixed, so the marker must then be removed.
(The line-break-in-address bug is fixed; its markers were removed.)
"""
import re
import uuid
from pathlib import Path

import pytest

from app.services import tailor_validator
from app.services.applications import clean_recruiter_email, is_email_address
from tests.test_application_email import (  # noqa: F401 - fixtures are used by name
    GOOD_EMAIL, _settings_override, _write, add_email, env,
)
from tests.test_applications import OTHER, URL, USER, _auth, _get, _patch, add_app, client, ts
from tests.test_tailor import (
    GOOD_EMAIL_BODY, JOB_TEXT, RECRUITER, SOURCE_TEXT, _body, _post,
)
from tests.test_tailor import env as tailor_env  # noqa: F401 - fixture, different from `env`

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "0005_recruiter_email.sql"


# ---- migration 0005 (static checks; a real Postgres was not available) -------------

def _sql_without_comments() -> str:
    lines = [ln.split("--", 1)[0] for ln in MIGRATION.read_text(encoding="utf-8").splitlines()]
    return "\n".join(lines).lower()


def test_migration_0005_adds_the_enum_value_but_never_uses_it():
    # Postgres: a new enum value cannot be used in the transaction that adds it
    # (the SQL Editor runs the whole file as one transaction).
    sql = _sql_without_comments()
    assert "alter type public.doc_type add value if not exists 'email'" in sql
    assert sql.count("'email'") == 1, "'email' may appear only in the ALTER TYPE statement"
    for forbidden in ("insert into", "update ", "default 'email'", "::doc_type", "create index"):
        assert forbidden not in sql, forbidden


def test_migration_0005_is_re_runnable_and_keeps_the_254_limit():
    sql = _sql_without_comments()
    assert "add column if not exists recruiter_email text" in sql
    assert re.search(r"drop constraint if exists applications_recruiter_email_length", sql)
    assert re.search(r"char_length\(recruiter_email\) <= 254", sql)
    # the constraint is dropped BEFORE it is added
    assert sql.index("drop constraint if exists") < sql.index("add constraint")
    # no new table, so no new RLS work is needed; and nothing weakens the old policies
    assert "create table" not in sql and "disable row level security" not in sql


# ---- recruiter address: validator ---------------------------------------------------

# Fixed: '$' also matched before a trailing newline; the regexes now use re.fullmatch and
# any whitespace / control character is rejected.
@pytest.mark.parametrize("value", ["jane\n@globex.com", "jane@globex\n.com"])
def test_address_with_a_line_break_inside_is_invalid(value):
    assert is_email_address(value) is False
    with pytest.raises(ValueError):
        clean_recruiter_email(value)


def test_patch_with_a_line_break_inside_the_address_is_422(env):
    r = _patch(env.ids.app_id, {"recruiter_email": "jane\n@globex.com"})
    assert r.status_code == 422
    assert env.db.rows("applications")[0]["recruiter_email"] == RECRUITER


@pytest.mark.parametrize("value", [
    "jane@globex.com\nBcc: evil@x.com", "jane\r\n@globex.com", "jane@globex.com\x00",
    "ja\tne@globex.com", "jane@globex.com;bob@globex.com", "<jane@globex.com>",
    "jane@globex.com (Jane)", "Jane <jane@globex.com>", "jane＠globex.com",
    "jane@globex.com​", "jane@[10.0.0.1]", "jane@10.0.0.1", "\"jane doe\"@globex.com",
    "jane@globex.com.", "jane@.globex.com", "jane@globex.-com",
], ids=lambda v: repr(v)[:30])
def test_header_injection_and_odd_addresses_are_rejected(value):
    with pytest.raises(ValueError):
        clean_recruiter_email(value)


@pytest.mark.parametrize("value", ["a@b.co", "a.b@c-d.io", "X@Y.ORG", "a+b@c.com", "a@c.xn--p1ai"])
def test_short_but_valid_addresses_are_accepted(value):
    assert clean_recruiter_email(value) == value


# ---- recruiter address: API ----------------------------------------------------------

def test_patch_recruiter_email_of_another_user_is_404_and_unchanged(env):
    theirs = add_app(env.db, 5, user=OTHER)
    row = next(a for a in env.db.rows("applications") if a["id"] == theirs.app_id)
    row["recruiter_email"] = "theirs@initech.example"
    r = _patch(theirs.app_id, {"recruiter_email": "mine@globex.example"})
    assert r.status_code == 404 and r.json() == {"detail": "Application not found"}
    assert row["recruiter_email"] == "theirs@initech.example"
    assert env.logged == []
    # ... and my own application is untouched too
    assert env.db.rows("applications")[0]["recruiter_email"] == RECRUITER


def test_another_users_recruiter_email_is_never_returned(env):
    theirs = add_app(env.db, 5, user=OTHER)
    next(a for a in env.db.rows("applications")
         if a["id"] == theirs.app_id)["recruiter_email"] = "theirs@initech.example"
    assert "initech" not in _get().text
    r = _get(f"/{theirs.app_id}")
    assert r.status_code == 404 and "initech" not in r.text


@pytest.mark.parametrize("body", [
    {"recruiter_mail": "a@b.com"}, {"recruiter_email": "a@b.com", "user_id": OTHER},
    {"recruiter_email": ["a@b.com"]}, {"recruiter_email": {"x": 1}}, {"recruiter_email": True},
], ids=["typo-field", "extra-field", "list", "object", "bool"])
def test_patch_rejects_unknown_fields_and_wrong_types(env, body):
    r = _patch(env.ids.app_id, body)
    assert r.status_code == 422
    assert env.db.rows("applications")[0]["recruiter_email"] == RECRUITER
    assert env.logged == []


def test_patch_with_a_huge_recruiter_email_is_a_fast_422(env):
    r = _patch(env.ids.app_id, {"recruiter_email": "a" * 200_000 + "@globex.com"})
    assert r.status_code == 422
    assert env.db.rows("applications")[0]["recruiter_email"] == RECRUITER


def test_tailor_with_a_huge_recruiter_email_is_a_422_and_calls_no_ai(tailor_env):
    r = _post(_body(tailor_env, recruiter_email="a" * 200_000 + "@globex.com"))
    assert r.status_code == 422
    assert tailor_env.job_ai.calls == [] and tailor_env.ai.calls == []
    assert tailor_env.db.rows("job_posts") == [] and tailor_env.logged == []


@pytest.mark.parametrize("over", [
    {"recruiter_email": "bad", "write_email": False},
    {"recruiter_email": "bad", "write_email": True},
], ids=["no-email-requested", "email-requested"])
def test_invalid_recruiter_email_is_rejected_even_when_no_email_is_written(tailor_env, over):
    r = _post(_body(tailor_env, **over))
    assert r.status_code == 422
    assert tailor_env.job_ai.calls == [] and tailor_env.ai.calls == []


@pytest.mark.parametrize("sub", [USER, OTHER])
def test_recruiter_email_is_saved_for_the_calling_user_only(tailor_env, sub):
    tailor_env.db.tables["user_resumes"][0]["user_id"] = sub
    r = _post(_body(tailor_env, recruiter_email=RECRUITER), sub=sub)
    assert r.status_code == 201, r.text
    [application] = tailor_env.db.rows("applications")
    assert application["user_id"] == sub and application["recruiter_email"] == RECRUITER


# ---- the address must not leak: prompts, logs, console, error answers --------------------

SECRET_ADDRESS = "recruiter.secret+jobs@globex-hiring.example"


@pytest.mark.parametrize("failure", ["save", "ai", "job_ai"])
def test_failure_paths_never_print_or_return_the_recruiter_address(tailor_env, capsys, failure):
    if failure == "save":
        tailor_env.db.fail_on.add(("applications", "insert"))
    elif failure == "ai":
        tailor_env.ai.error = RuntimeError("boom globex-hiring Jane Doe sk-secret")
    else:
        tailor_env.job_ai.error = RuntimeError("boom globex-hiring Jane Doe sk-secret")
    r = _post(_body(tailor_env, recruiter_email=SECRET_ADDRESS))
    assert r.status_code in (500, 502)
    out = capsys.readouterr()
    for text in (out.out, out.err, r.text, str(tailor_env.logged)):
        assert "globex-hiring" not in text and "recruiter.secret" not in text
        assert "Jane" not in text and "secret-key-123" not in text and "sk-secret" not in text
    assert tailor_env.db.rows("job_posts") == []  # nothing half-saved


def test_the_address_only_reaches_the_applications_table(tailor_env):
    r = _post(_body(tailor_env, recruiter_email=SECRET_ADDRESS))
    assert r.status_code == 201
    holders = [(table, row) for table, rows in tailor_env.db.tables.items() for row in rows
               if SECRET_ADDRESS in str(row)]
    assert [t for t, _ in holders] == ["applications"]


def test_a_job_post_that_mentions_the_address_keeps_it_out_of_the_logs(tailor_env):
    # The user pasted the address inside the job text themselves: the AI sees the job text
    # (that is the user's own choice), but the activity log must still hold no text at all.
    r = _post(_body(tailor_env, job_text=JOB_TEXT + f"Send your CV to {SECRET_ADDRESS}\n",
                    recruiter_email=SECRET_ADDRESS))
    assert r.status_code == 201
    assert "globex-hiring" not in str(tailor_env.logged)


# ---- POST /applications/{id}/email: more edge cases ----------------------------------------

@pytest.mark.parametrize("body", [None, {}, {"model_id": None}, {"unknown": 1}],
                         ids=["no-body", "empty-object", "null-model", "extra-field"])
def test_write_email_accepts_every_harmless_body(env, body):
    assert _write(env.ids.app_id, body).status_code == 201


def test_write_email_with_a_json_null_body_uses_the_default_model(env):
    r = client.post(f"{URL}/{env.ids.app_id}/email", content="null",
                    headers={**_auth(), "Content-Type": "application/json"})
    assert r.status_code == 201, r.text
    assert env.ai.calls[0]["model_id"] == "groq:llama-3.3-70b-versatile"


@pytest.mark.parametrize("body", ["[]", "5", '"x"', '{"model_id": 5}', "{bad json"])
def test_write_email_with_a_malformed_body_is_422_and_calls_no_ai(env, body):
    r = client.post(f"{URL}/{env.ids.app_id}/email", content=body,
                    headers={**_auth(), "Content-Type": "application/json"})
    assert r.status_code == 422
    assert env.ai.calls == []


def test_write_email_still_finds_the_documents_among_many_email_versions(env):
    for i in range(40):  # newer than the resume and cover letter
        add_email(env.db, env.ids.job_id, ts(100 + i))
    r = _write(env.ids.app_id)
    assert r.status_code == 201, r.text
    new = next(d for d in env.db.rows("generated_docs") if d["id"] == r.json()["id"])
    # source resume and template come from the resume / cover letter, never from an old email
    assert new["source_resume_id"] == env.resume_file and new["template"] == "harvard"
    assert "Software Engineer, Acme Corp" in env.ai.calls[0]["user"]


def test_write_email_never_sends_the_recruiter_address_even_if_the_job_has_it_in_notes(env):
    env.db.rows("applications")[0]["notes"] = f"Call {RECRUITER}"
    assert _write(env.ids.app_id).status_code == 201
    call = env.ai.calls[0]
    assert RECRUITER not in call["system"] + call["user"] and "Call " not in call["user"]


def test_write_email_with_two_matches_updates_only_the_newest(env):
    older = env.db.rows("match_results")[0]
    older["warnings"] = ["The email is empty. Use “Write a new version” in the Tracker."]
    newest = {**older, "id": str(uuid.uuid4()), "created_at": ts(99),
              "warnings": ["The email is empty. Use “Write a new version” in the Tracker."]}
    env.db.rows("match_results").append(newest)
    env.ai.output = {"email": {"subject": "S", "body": "Dear Hiring Manager,\n\nHi."}}
    assert _write(env.ids.app_id).status_code == 201
    assert newest["warnings"] == [] and older["warnings"] != []


def test_write_email_keeps_a_non_email_warning_that_starts_like_one(env):
    # Only "The email ..." lines are replaced; everything else survives.
    env.db.rows("match_results")[0]["warnings"] = [
        "The summary has a number that is not in your resume (7). Please check it.",
        "The cover letter mentions Docker, which is not in your resume. Please edit it before sending.",
        "The email mentions Kubernetes, which is not in your resume. Please edit it before sending.",
    ]
    assert _write(env.ids.app_id).status_code == 201  # GOOD_EMAIL: no warnings
    assert env.db.rows("match_results")[0]["warnings"] == [
        "The summary has a number that is not in your resume (7). Please check it.",
        "The cover letter mentions Docker, which is not in your resume. Please edit it before sending.",
    ]


def test_detail_still_works_when_the_newest_email_is_damaged_but_an_older_one_is_fine(env):
    add_email(env.db, env.ids.job_id, ts(5), content=GOOD_EMAIL)
    add_email(env.db, env.ids.job_id, ts(9), content={"subject": 5, "body": ["x"]})
    r = _get(f"/{env.ids.app_id}")
    assert r.status_code == 200
    # The newest row wins even if it is damaged: the screen shows "no email" and offers to write one.
    assert r.json()["email"] is None and r.json()["resume"] is not None


# ---- email validator: pinned behaviour found while probing ---------------------------------

def _check(body, subject="Application for Backend Engineer", gaps=("Kubernetes", "Docker"), **kw):
    return tailor_validator.validate_email_draft(
        {"subject": subject, "body": body}, source_text=SOURCE_TEXT, job_text=JOB_TEXT,
        gaps=list(gaps), **kw)


@pytest.mark.parametrize("greeting", [
    "dear john brown,", "DEAR JOHN BROWN,", "Dear Laura and Bob,", "Hi Bob,", "Hello John Brown!",
    "Dear Jane Doe,",  # the candidate's own name is not the recipient
    "Dear John Brown，",  # full-width comma
], ids=lambda g: g[:20])
def test_invented_or_wrong_greetings_become_hiring_manager(greeting):
    email, warnings = _check(f"{greeting}\n\nI am applying.\n\nJane Doe")
    assert email["body"].startswith("Dear Hiring Manager,")
    assert warnings == [tailor_validator.EMAIL_GREETING_WARNING]


@pytest.mark.parametrize("greeting", [
    "Good morning,", "Dear Hiring Manager", "dear hiring manager,", "Hello Globex team,",
    "Dear Laura Smith", "Dear Dr. Smith,", "To whom it may concern,", "Dear recruiter,",
], ids=lambda g: g[:20])
def test_generic_or_job_post_greetings_are_kept(greeting):
    email, warnings = _check(f"{greeting}\n\nI am applying.")
    assert email["body"].startswith(greeting) and warnings == []


def test_gap_skill_in_the_subject_only_is_still_warned():
    _, warnings = _check("Dear Hiring Manager,\n\nHello.", subject="Kubernetes expert for Globex")
    assert warnings == [
        "The email mentions Kubernetes, which is not in your resume. Please edit it before sending."]


def test_numbers_and_phone_formats():
    # a phone number written with spaces is fine; years that are not in the resume are not
    _, warnings = _check("Dear Hiring Manager,\n\nJane\n+1 555 123 4567")
    assert warnings == []
    _, warnings = _check("Dear Hiring Manager,\n\nSince 2015 I have coded; 99% uptime.")
    assert warnings == [
        "The email has a number that is not in your resume or the job post (2015, 99). "
        "Please check it."]


def test_email_address_check_ignores_case_and_flags_new_addresses():
    _, warnings = _check("Dear Hiring Manager,\n\nJane\nJANE.DOE@EXAMPLE.COM")
    assert warnings == []
    _, warnings = _check("Dear Hiring Manager,\n\nWrite to foo@bar.com.")
    assert warnings == [tailor_validator.EMAIL_CONTACT_WARNING]


def test_email_validator_never_crashes_on_odd_types():
    odd = [None, 0, 1.5, True, [], {}, [None], [[]], [{}], {"a": 1}, ["a", 2, None], "x", " ", "\x00"]
    for subject in odd:
        for body in odd:
            email, warnings = tailor_validator.validate_email_draft(
                {"subject": subject, "body": body}, source_text=SOURCE_TEXT,
                job_text=JOB_TEXT, gaps=["Kubernetes"])
            assert email is None or (isinstance(email["subject"], str)
                                     and isinstance(email["body"], str))
            assert all(isinstance(w, str) for w in warnings)


def test_email_markdown_pathologies_do_not_change_normal_text():
    # snake_case words, e-mail addresses and times must survive the markdown stripper
    text = "Dear Hiring Manager,\n\nI use snake_case_names, jane_doe@example.com and 10*3*2 at 9:00."
    email, _ = _check(text)
    assert "snake_case_names" in email["body"] and "jane_doe@example.com" in email["body"]
    assert GOOD_EMAIL_BODY.split("\n")[0] in _check(GOOD_EMAIL_BODY)[0]["body"]
