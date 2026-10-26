"""A tiny in-memory stand-in for the Supabase admin client (tables + Storage).

Supports what the services use: select / insert (dict or list) / update / delete,
eq, in_, order (chained), limit, execute; JSON-path aliases in select such as
"location:parsed->>location"; and storage.from_(bucket).upload (with upsert),
remove, list and create_signed_url.
`cascade` mimics "on delete cascade" from job_posts.
"""
import re
import uuid
from urllib.parse import quote

_DEFAULTS = {
    "job_posts": {"title": None, "company": None, "source_url": None, "parsed": None},
    "applications": {"status": "saved", "applied_at": None, "follow_up_at": None,
                     "notes": None},
    "match_results": {"matched": [], "gaps": [], "warnings": []},
    "generated_docs": {"template": None, "source_resume_id": None, "file_path": None,
                       "version": 1},
}
_HAS_UPDATED_AT = {"applications"}
_CASCADE_FROM = {"job_posts": ("generated_docs", "match_results", "applications")}
_JSON_ALIAS_RE = re.compile(r"^\s*(\w+)\s*:\s*(\w+)\s*->>\s*(\w+)\s*$")


class _Result:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db: "FakeSupabase", table: str):
        self.db = db
        self.table_name = table
        self.mode = "select"
        self.filters: list = []
        self.in_filters: list[tuple[str, tuple]] = []
        self.payload = None
        self.orders: list[tuple[str, bool]] = []
        self.max_rows: int | None = None
        self.json_aliases: list[tuple[str, str, str]] = []  # (alias, column, key)

    def select(self, *columns, **_k):
        self.mode = "select"
        for part in ",".join(columns).split(","):
            found = _JSON_ALIAS_RE.match(part)
            if found:
                self.json_aliases.append(found.groups())
        return self

    def insert(self, payload):
        self.mode, self.payload = "insert", payload
        return self

    def update(self, payload):
        self.mode, self.payload = "update", payload
        return self

    def delete(self):
        self.mode = "delete"
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def in_(self, column, values):
        self.in_filters.append((column, tuple(values)))
        return self

    def order(self, column, desc=False, **_k):
        self.orders.append((column, desc))
        return self

    def limit(self, n):
        self.max_rows = n
        return self

    def _match(self, row: dict) -> bool:
        return (all(row.get(c) == v for c, v in self.filters)
                and all(row.get(c) in vs for c, vs in self.in_filters))

    def _project(self, row: dict) -> dict:
        out = dict(row)
        for alias, column, key in self.json_aliases:
            value = row.get(column)
            inner = value.get(key) if isinstance(value, dict) else None
            out[alias] = None if inner is None else str(inner)
        return out

    def execute(self):
        self.db.calls.append((self.table_name, self.mode, list(self.filters)
                              + [(c, ("in", vs)) for c, vs in self.in_filters]))
        if (self.table_name, self.mode) in self.db.fail_on or self.table_name in self.db.fail_on:
            raise RuntimeError("db exploded: secret-key-123 Jane Doe")
        rows = self.db.tables.setdefault(self.table_name, [])

        if self.mode == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            saved = []
            for item in items:
                self.db.counter += 1
                row = {"id": str(uuid.uuid4()),
                       "created_at": f"2026-01-01T00:00:{self.db.counter:02d}+00:00",
                       **_DEFAULTS.get(self.table_name, {}), **item}
                if self.table_name in _HAS_UPDATED_AT:
                    row.setdefault("updated_at", row["created_at"])
                rows.append(row)
                saved.append(row)
            return _Result(saved)

        found = [r for r in rows if self._match(r)]
        if self.mode == "update":
            for r in found:
                r.update(self.payload)
                if self.table_name in _HAS_UPDATED_AT and "updated_at" not in self.payload:
                    r["updated_at"] = "2026-06-01T12:00:00+00:00"  # the DB trigger
            return _Result([dict(r) for r in found])

        if self.mode == "delete":
            for r in found:
                rows.remove(r)
                for child in _CASCADE_FROM.get(self.table_name, ()):
                    kept = [c for c in self.db.tables.get(child, [])
                            if c.get("job_post_id") != r["id"]]
                    self.db.tables[child] = kept
            return _Result(found)

        for column, desc in reversed(self.orders):  # stable sort: last key first
            found = sorted(found, key=lambda r: (r.get(column) is None, r.get(column) or 0),
                           reverse=desc)
        if self.max_rows is not None:
            found = found[: self.max_rows]
        return _Result([self._project(r) for r in found])


class FakeBucket:
    def __init__(self, storage: "FakeStorage", name: str):
        self.storage = storage
        self.name = name

    def upload(self, path, data, file_options=None):
        options = file_options or {}
        if self.storage.fail_upload:
            raise RuntimeError("storage exploded: secret-key-123")
        if (self.name, path) in self.storage.files and str(options.get("upsert")) != "true":
            raise RuntimeError("The resource already exists")  # like Supabase without upsert
        self.storage.files[(self.name, path)] = {"data": data, "options": options}
        return {"path": path}

    def remove(self, paths):
        if self.storage.fail_remove:
            raise RuntimeError("storage exploded: secret-key-123")
        self.storage.removed.extend((self.name, p) for p in paths)
        for p in paths:
            self.storage.files.pop((self.name, p), None)
        return []

    def list(self, path=None, options=None):
        if self.storage.fail_list:
            raise RuntimeError("storage exploded: secret-key-123")
        self.storage.listed.append((self.name, path, options))
        prefix = (path or "").rstrip("/") + "/"
        names = [p[len(prefix):] for (b, p) in self.storage.files
                 if b == self.name and p.startswith(prefix) and "/" not in p[len(prefix):]]
        return [{"name": n, "id": str(uuid.uuid4())} for n in sorted(names)]

    def create_signed_url(self, path, expires_in, options=None):
        if self.storage.fail_sign:
            raise RuntimeError("storage exploded: secret-key-123")
        self.storage.signed.append((self.name, path, expires_in, options or {}))
        url = (f"https://example.supabase.co/storage/v1/object/sign/{self.name}/{path}"
               f"?token=fake-token")
        download = (options or {}).get("download")
        if download:
            url += f"&download={quote(str(download))}"
        return {"signedURL": url, "signedUrl": url}


class FakeStorage:
    def __init__(self):
        self.files: dict[tuple[str, str], dict] = {}
        self.removed: list[tuple[str, str]] = []
        self.listed: list = []
        self.signed: list = []
        self.fail_upload = False
        self.fail_remove = False
        self.fail_list = False
        self.fail_sign = False

    def from_(self, bucket):
        return FakeBucket(self, bucket)


class FakeSupabase:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.fail_on: set = set()  # {"table"} or {("table", "insert")}
        self.calls: list = []
        self.counter = 0
        self.storage = FakeStorage()

    def table(self, name):
        return FakeQuery(self, name)

    def rows(self, name) -> list[dict]:
        return self.tables.get(name, [])
