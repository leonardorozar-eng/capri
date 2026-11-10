# -*- coding: utf-8 -*-
"""Put the files in app/ and the lachy strips into the installed Capri asar."""
import hashlib, json, os, struct, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "app")
CACHE = os.path.join(HERE, "cache", "sprites")
SPRITES = [
    "idle.png", "grin.png", "glitch.png", "dangle.png", "arrive.png",
    "walk.png", "perch.png", "laydown.png", "laydown_sleep.png",
]
RAW = "https://raw.githubusercontent.com/lachydotmcg/capri-desktop/v0.8.0/assets/sprites/"

def asar_path():
    local = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(local, "Programs", "capri-desktop", "resources", "app.asar")

def load(path):
    data = open(path, "rb").read()
    u = lambda o: struct.unpack_from("<I", data, o)[0]
    slen = u(12)
    header = json.loads(data[16:16 + slen].decode("utf-8"))
    return data, header, 8 + u(4)

def integrity(blob):
    whole = hashlib.sha256(blob).hexdigest()
    step = 4194304
    blocks = [hashlib.sha256(blob[i:i + step]).hexdigest() for i in range(0, len(blob), step)] if blob else []
    return {"algorithm": "SHA256", "hash": whole, "blockSize": step, "blocks": blocks}

def node_for(blob):
    return {"size": len(blob), "integrity": integrity(blob), "offset": "0"}

def ensure_dir(header, parts):
    node = header
    for part in parts:
        files = node.setdefault("files", {})
        child = files.get(part)
        if child is None:
            child = {"files": {}}
            files[part] = child
        if "files" not in child:
            raise SystemExit("not a directory: " + "/".join(parts))
        node = child
    return node

def find(header, parts):
    node = header
    for part in parts:
        node = node["files"][part]
    return node

def put(header, rel, blob, replaced):
    parts = rel.split("/")
    parent = ensure_dir(header, parts[:-1])
    parent["files"][parts[-1]] = node_for(blob)
    replaced[rel] = blob

def collect(node, path, out):
    if "files" in node:
        for name, child in node["files"].items():
            collect(child, (path + "/" + name) if path else name, out)
        return
    if not node.get("unpacked"):
        out.append(path)

def header_bytes(header):
    raw = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    string_len = len(raw)
    payload = 4 + string_len + 1
    pad = (4 - (payload % 4)) % 4
    pickle_len = 4 + payload + pad
    return b"".join([
        struct.pack("<I", 4),
        struct.pack("<I", pickle_len),
        struct.pack("<I", pickle_len - 4),
        struct.pack("<I", string_len),
        raw,
        b"\x00",
        b"\x00" * pad,
    ])

def fetch_sprites():
    os.makedirs(CACHE, exist_ok=True)
    for name in SPRITES:
        dest = os.path.join(CACHE, name)
        if os.path.isfile(dest) and os.path.getsize(dest) > 1000:
            continue
        print("sprite", name)
        urllib.request.urlretrieve(RAW + name, dest)

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else asar_path()
    if not os.path.isfile(target):
        raise SystemExit("asar missing: " + target)
    fetch_sprites()
    data, header, body_at = load(target)
    replaced = {}
    for dirpath, _, names in os.walk(APP):
        for name in names:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, APP).replace("\\", "/")
            put(header, rel, open(full, "rb").read(), replaced)
    for name in SPRITES:
        put(header, "assets/lachy/" + name, open(os.path.join(CACHE, name), "rb").read(), replaced)
    order = []
    collect(header, "", order)
    body = bytearray()
    cursor = 0
    for rel in order:
        node = find(header, rel.split("/"))
        if rel in replaced:
            blob = replaced[rel]
            node["size"] = len(blob)
            node["integrity"] = integrity(blob)
        else:
            off = int(node["offset"])
            size = int(node["size"])
            blob = data[body_at + off: body_at + off + size]
        node["offset"] = str(cursor)
        body += blob
        cursor += len(blob)
    tmp = target + ".new"
    open(tmp, "wb").write(header_bytes(header) + bytes(body))
    os.replace(tmp, target)
    print("packed", target, "files", len(replaced))

if __name__ == "__main__":
    main()
