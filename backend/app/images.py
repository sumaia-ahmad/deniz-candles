import os
import uuid

from flask import current_app
from PIL import Image, UnidentifiedImageError


class NotAnImage(ValueError):
    pass


def uploads_dir(*parts):
    """A folder for uploaded files, inside the instance folder (never committed to git)."""
    folder = os.path.join(current_app.instance_path, "uploads", *parts)
    os.makedirs(folder, exist_ok=True)
    return folder


def save_image(file_storage, folder, max_side, quality=85):
    """Check the upload is a real image, shrink it and re-save it as JPEG.

    Re-saving also drops hidden metadata (such as the phone's location). Returns the new file name.
    """
    try:
        image = Image.open(file_storage.stream)
        image.load()
    except (UnidentifiedImageError, OSError):
        raise NotAnImage from None

    image = image.convert("RGB")
    image.thumbnail((max_side, max_side))
    filename = f"{uuid.uuid4().hex}.jpg"
    image.save(os.path.join(folder, filename), "JPEG", quality=quality, optimize=True)
    return filename
