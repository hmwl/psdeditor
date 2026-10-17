                      














import json
import sys


def enum_name(v):

    if v is None:
        return None
    name = getattr(v, "name", None)
    if name is not None:
        val = getattr(v, "value", None)
        if isinstance(val, bytes):
            return val.decode("ascii", "replace")
        return name
    if isinstance(v, bytes):
        return v.decode("ascii", "replace")
    return v


def dump(path):
    from psd_tools import PSDImage

    psd = PSDImage.open(path)._record
    h = psd.header

    out = {
        "ok": True,
        "header": {
            "version": h.version,
            "psb": h.version == 2,
            "channels": h.channels,
            "width": h.width,
            "height": h.height,
            "depth": h.depth,
            "mode": int(h.color_mode),
            "modeName": enum_name(h.color_mode),
        },
        "colorModeDataLength": len(psd.color_mode_data.value) if psd.color_mode_data else 0,
        "layers": [],
        "imageResources": [],
        "globalTaggedBlocks": [],
    }

    for key, res in (psd.image_resources or {}).items():
        out["imageResources"].append({
            "id": int(getattr(key, "value", key)),
            "key": enum_name(key),
            "name": getattr(res, "name", "") or "",
        })

    lami = psd.layer_and_mask_information
    info = getattr(lami, "layer_info", None)
    records = getattr(info, "layer_records", None) if info else None
    if records:
        for lr in records:
            mask = getattr(lr, "mask_data", None)
            blocks = list(lr.tagged_blocks.keys()) if lr.tagged_blocks else []
            out["layers"].append({
                "name": lr.name,
                "bounds": {"top": lr.top, "left": lr.left, "bottom": lr.bottom, "right": lr.right},
                "blendMode": enum_name(lr.blend_mode),
                "opacity": lr.opacity,
                "clipping": int(getattr(lr.clipping, "value", lr.clipping)),
                "visible": bool(lr.flags.visible),
                "transparencyProtected": bool(lr.flags.transparency_protected),
                "channelCount": len(lr.channel_info),
                "channelIds": [int(getattr(c.id, "value", c.id)) for c in lr.channel_info],
                "hasMask": mask is not None,
                "additionalKeys": [enum_name(b) for b in blocks],
            })

    gtb = getattr(lami, "tagged_blocks", None)
    if gtb:
        out["globalTaggedBlocks"] = [enum_name(k) for k in gtb.keys()]

    return out


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "usage: psdtools_dump.py <file>"}))
        return 0
    try:
        result = dump(sys.argv[1])
    except Exception as exc:                                    
        result = {"ok": False, "error": "{}: {}".format(type(exc).__name__, exc)}
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
