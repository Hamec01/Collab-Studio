# Stage 5B Slice 1 — TrackAsset-bound audio annotations

Дата: 6 июля 2026 года
Статус: local PASS, production untouched

## Scope

- привязать новые timestamp audio annotations к `TrackAsset`;
- сохранить legacy annotations без `trackAssetId` как track-level fallback;
- фильтровать список annotations по активному audio source;
- не менять waveform, annotation threads, upload contract или production deploy.

## Data model

- `Annotation.trackAssetId` — nullable FK на `TrackAsset`, `ON DELETE SET NULL`
- additive migration:
  - `20260706130000_stage5b_audio_annotations_track_assets`

## Server contract

- `POST /api/projects/:projectId/tracks/:trackId/annotations`
  - теперь принимает optional `trackAssetId`
  - сервер проверяет, что asset:
    - существует;
    - принадлежит тому же `projectId`;
    - принадлежит тому же `trackId`;
    - не soft-deleted;
    - не имеет `status=DELETED`
- response annotation additive включает `trackAssetId`

## Frontend behavior

- creation path передаёт active `TrackAsset.id`
- visible annotations for current track:
  - все legacy annotations с `trackAssetId = null`
  - плюс annotations, где `trackAssetId === activeTrackAssetId`
- annotations другой версии скрыты
- клик по annotation вызывает seek в shared playback engine
- если активного local TrackAsset нет:
  - создание timestamp annotation disabled
- external-only и legacy-only states не создают fake `trackAssetId`

## Compatibility rules

- legacy annotation rows продолжают отображаться
- legacy-only audio fallback не ломается
- native-only TrackAsset supported
- raw storage fields в annotation API/DTO не добавляются

## Local test matrix

- current asset annotation visible
- different-asset annotation hidden
- legacy null annotation visible
- source switch updates annotation list
- annotation click seeks player
- invalid cross-track asset rejected by API
- native-only asset supported
- legacy-only behavior preserved

## Rollback

- additive schema rollback only через DB restore + previous app commit
- no production rollout in this slice
