"""Write backend-shaped API fixtures for the app's contract tests.

Each fixture is built by validating sample data through the backend's own Pydantic
response model and dumping it the way FastAPI does (`mode="json"`). The output
carries every field, default and computed value the backend really sends. The request
schemas of the calls the app makes are dumped too, so a test can check that the app
sends only declared keys.

Run from the app root with the backend environment:

    uv run --project /Users/sakshammittal/Documents/360ghar/github/360ghar/360ghar-backend python tool/api_fixtures.py

It imports schemas only: no app start-up, no database, no network.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
BACKEND = APP.parents[2] / "360ghar-backend"
OUT = APP / "test" / "fixtures" / "api"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(APP / "tool"))

import gen_enums  # noqa: E402
from app.api.api_v1.endpoints.auth import AuthConfigResponse  # noqa: E402
from app.infrastructure.errors import ErrorEnvelope, ValidationErrorEnvelope  # noqa: E402
from app.schemas.pagination import CursorPage  # noqa: E402
from app.schemas.storage import (  # noqa: E402
    PresignedUploadItem,
    PresignedUploadRequest,
    PresignedUploadResponse,
    UploadConfirmResponse,
)
from app.schemas.tour import (  # noqa: E402
    AIJobResponse,
    AIJobStatusResponse,
    FloorPlanResponse,
    Hotspot,
    HotspotCreate,
    HotspotUpdate,
    PublicScene,
    PublicTourWithScenes,
    Scene,
    SceneCreate,
    SceneStitchRequest,
    Tour,
    TourAnalytics,
    TourCreate,
    TourWithScenes,
)

NOW = "2026-10-15T09:30:00Z"
LATER = "2026-10-15T09:31:10Z"
TOUR_ID = "3f0c7a52-6a77-4a46-8f37-2c1d9e7b0a11"
MAIN_SCENE = "6b1d2f10-5b5e-4c0e-9d0e-0a1f6a7c1001"
ROOM_SCENE = "6b1d2f10-5b5e-4c0e-9d0e-0a1f6a7c1002"
CDN = "https://res.cloudinary.com/demo/image/upload"


def dump(model_cls, data):
    return model_cls.model_validate(data).model_dump(mode="json")


def page(model_cls, items, *, next_cursor=None, limit=20):
    return dump(
        CursorPage[model_cls],
        {"items": items, "next_cursor": next_cursor, "has_more": next_cursor is not None, "limit": limit},
    )


def tour(**extra):
    base = {
        "id": TOUR_ID,
        "title": "Flat 4B, Sector 54",
        "description": None,
        "status": "draft",
        "is_public": False,
        "visibility": "unlisted",
        "short_code": None,
        "is_featured": False,
        "view_count": 0,
        "like_count": 0,
        "share_count": 0,
        "created_at": NOW,
        "updated_at": NOW,
        "user_id": 7,
    }
    base.update(extra)
    return base


def hotspot(hid: str, scene_id: str, target: str | None, **extra):
    base = {
        "id": hid,
        "scene_id": scene_id,
        "type": "navigation",
        "position": {"yaw": 45.5, "pitch": -12.25},
        "target_scene_id": target,
        "title": "Kitchen",
        "icon_size": 32,
        "order_index": 0,
        "is_active": True,
        "created_at": NOW,
        "updated_at": NOW,
    }
    base.update(extra)
    return base


def scene(sid: str, order: int, hotspots=None, **extra):
    base = {
        "id": sid,
        "tour_id": TOUR_ID,
        "title": "Living room" if order == 0 else "Kitchen",
        "image_url": f"{CDN}/tours/{TOUR_ID}/originals/{sid}",
        "order_index": order,
        "is_processed": True,
        "created_at": NOW,
        "updated_at": NOW,
        "hotspots": hotspots or [],
    }
    base.update(extra)
    return base


def floor_plan(fid: str, **extra):
    base = {
        "id": fid,
        "tour_id": TOUR_ID,
        "name": "Ground floor",
        "image_url": f"{CDN}/tours/{TOUR_ID}/plan-1",
        "floor_number": 1,
        "markers": [{"scene_id": MAIN_SCENE, "x": 40.5, "y": 22.0, "label": "Living room"}],
        "created_at": NOW,
        "updated_at": NOW,
    }
    base.update(extra)
    return base


def media(**extra):
    base = {
        "id": "9d3a5e4c-1f1e-4a3b-8c5d-7e6f5a4b3c2d",
        "user_id": 7,
        "tour_id": TOUR_ID,
        "filename": "panorama.jpg",
        "original_filename": "panorama.jpg",
        "file_url": f"{CDN}/tours/{TOUR_ID}/originals/pano",
        "file_size": 2_483_120,
        "mime_type": "image/jpeg",
        "visibility": "private",
        "is_processed": True,
        "created_at": NOW,
    }
    base.update(extra)
    return base


def job(status: str, **extra):
    base = {
        "id": "b7c4e1d2-93a8-4f60-a5b1-0c2d3e4f5a6b",
        "job_type": "panorama_stitch",
        "status": status,
        "progress": 0,
        "tour_id": TOUR_ID,
        "scene_id": MAIN_SCENE,
        "created_at": NOW,
    }
    base.update(extra)
    return base


def fixtures():
    main_hotspot = hotspot("h-1", MAIN_SCENE, ROOM_SCENE)
    return {
        "tours": {
            "created": dump(Tour, tour()),
            "published": dump(
                Tour,
                tour(status="published", short_code="aB3xZ9", published_at=LATER),
            ),
            "published_no_short_code": dump(Tour, tour(status="published")),
            "detail": dump(
                TourWithScenes,
                {
                    **tour(status="published", short_code="aB3xZ9", scene_count=2),
                    "scenes": [
                        scene(MAIN_SCENE, 0, [main_hotspot]),
                        scene(ROOM_SCENE, 1),
                    ],
                    "floor_plans": [floor_plan("fp-1")],
                },
            ),
            # A caller who does not own the tour gets the public shape: no
            # user_id, public scenes. The app reads both through TourDetailDto.
            "detail_public": dump(
                PublicTourWithScenes,
                {
                    **{k: v for k, v in tour(status="published", short_code="aB3xZ9").items() if k != "user_id"},
                    "scenes": [dump(PublicScene, scene(MAIN_SCENE, 0, [main_hotspot]))],
                    "floor_plans": [floor_plan("fp-1")],
                    "main_scene_id": MAIN_SCENE,
                },
            ),
            "detail_empty": dump(TourWithScenes, tour()),
            "analytics": dump(
                TourAnalytics,
                {
                    "tour_id": TOUR_ID,
                    "total_views": 41,
                    "unique_views": 30,
                    "total_likes": 3,
                    "total_shares": 2,
                    "avg_session_duration": 52.5,
                    "scene_views": {MAIN_SCENE: 30, ROOM_SCENE: 11},
                    "hotspot_clicks": {"h-1": 6, "h-2": 4},
                    "session_durations": [30.0, 75.5, 52.0],
                    "daily_views": [{"date": "2026-10-14", "views": 12}],
                },
            ),
        },
        "scenes": {
            "created": dump(Scene, scene(MAIN_SCENE, 0)),
        },
        "hotspots": {
            "list_page": page(
                Hotspot,
                [
                    main_hotspot,
                    hotspot("h-2", MAIN_SCENE, None, title=None, position=None, type="info"),
                ],
                next_cursor="eyJrIjpbMCwiaC0yIl0sImYiOiJhYmMifQ",
                limit=100,
            ),
            "list_last_page": page(
                Hotspot,
                [hotspot("h-3", MAIN_SCENE, ROOM_SCENE, order_index=2)],
                limit=100,
            ),
            "created": dump(Hotspot, main_hotspot),
            "updated": dump(
                Hotspot, hotspot("h-1", MAIN_SCENE, ROOM_SCENE, title="Bedroom")
            ),
            # PATCH of target_scene_id on a non-navigation hotspot: the server
            # keeps no target but still writes the title.
            "updated_info": dump(
                Hotspot,
                hotspot("h-2", MAIN_SCENE, None, title="Bedroom", type="info"),
            ),
        },
        "floor_plans": {
            "list_page": page(
                FloorPlanResponse,
                [floor_plan("fp-1")],
                next_cursor="eyJrIjpbMSwiZnAtMSJdLCJmIjoiYWJjIn0",
                limit=100,
            ),
            "list_last_page": page(
                FloorPlanResponse, [floor_plan("fp-2", name="First floor", floor_number=2)], limit=100
            ),
        },
        "uploads": {
            "presigned": dump(
                PresignedUploadResponse,
                {
                    "items": [
                        {
                            "upload_id": "up-7f3e",
                            "signed_url": "https://api.cloudinary.com/v1_1/demo/image/upload",
                            "signature": "5f1a9c3e7b2d4a6c8e0f1a2b3c4d5e6f7a8b9c0d",
                            "api_key": "123456789012345",
                            "timestamp": 1760520600,
                            "public_id": f"tours/{TOUR_ID}/originals/pano",
                            "path": f"tours/{TOUR_ID}/originals/pano",
                            "public_url": f"{CDN}/tours/{TOUR_ID}/originals/pano",
                        }
                    ]
                },
            ),
            "presigned_authenticated": dump(
                PresignedUploadResponse,
                {
                    "items": [
                        {
                            "upload_id": "up-9a1c",
                            "signed_url": "https://api.cloudinary.com/v1_1/demo/raw/upload",
                            "signature": "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567",
                            "api_key": "123456789012345",
                            "timestamp": 1760520601,
                            "public_id": "documents/lease.pdf",
                            "path": "documents/lease.pdf",
                            "public_url": f"{CDN}/documents/lease.pdf",
                            "type": "authenticated",
                        }
                    ]
                },
            ),
            "confirmed": dump(UploadConfirmResponse, {"media": media()}),
        },
        "ai_jobs": {
            "stitch_started": dump(AIJobResponse, {"job": job("pending")}),
            "stitch_processing": dump(
                AIJobStatusResponse, {"job": job("processing", progress=40, started_at=NOW)}
            ),
            "stitch_completed": dump(
                AIJobStatusResponse,
                {
                    "job": job("completed", progress=100, started_at=NOW, completed_at=LATER),
                    "result": {
                        "image_url": f"{CDN}/tours/{TOUR_ID}/stitched",
                        "width": 8192,
                        "height": 4096,
                    },
                },
            ),
            "stitch_failed": dump(
                AIJobStatusResponse,
                {
                    "job": job(
                        "failed",
                        progress=60,
                        started_at=NOW,
                        completed_at=LATER,
                        error_message="Not enough overlap between frames",
                    )
                },
            ),
        },
        "auth": {
            "config": dump(
                AuthConfigResponse,
                {"google_web_client_id": "web-client.apps.googleusercontent.com", "google_ios_client_id": None},
            ),
        },
        "errors": {
            "not_found": ErrorEnvelope.model_validate(
                {"error": {"code": "NOT_FOUND", "message": "Tour not found"}}
            ).model_dump(mode="json", exclude_defaults=True),
            "upload_not_in_storage": ErrorEnvelope.model_validate(
                {"error": {"code": "UPLOAD_NOT_IN_STORAGE", "message": "File not found in storage"}}
            ).model_dump(mode="json", exclude_defaults=True),
            "validation": dump(
                ValidationErrorEnvelope,
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Request validation failed",
                        "details": {
                            "fields": [
                                {
                                    "field": "body.title",
                                    "msg": "String should have at most 255 characters",
                                    "type": "string_too_long",
                                }
                            ]
                        },
                    }
                },
            ),
        },
        # The wire values of every enum the app uses (the same source as
        # lib/core/models/wire_enums.dart), so tests need no access outside the repo.
        "enums": {
            name: json.loads(gen_enums.SPEC.read_text())["components"]["schemas"][name]["enum"]
            for name in gen_enums.USED
        },
        # Request contract: the app must send only keys these schemas declare.
        "request_schemas": {
            "TourCreate": TourCreate.model_json_schema(),
            "SceneCreate": SceneCreate.model_json_schema(),
            "HotspotCreate": HotspotCreate.model_json_schema(),
            "HotspotUpdate": HotspotUpdate.model_json_schema(),
            "PresignedUploadRequest": PresignedUploadRequest.model_json_schema(),
            "PresignedUploadItem": PresignedUploadItem.model_json_schema(),
            "SceneStitchRequest": SceneStitchRequest.model_json_schema(),
        },
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for group, data in fixtures().items():
        path = OUT / f"{group}.json"
        path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
        print(f"wrote {path.relative_to(APP)}")


if __name__ == "__main__":
    main()
