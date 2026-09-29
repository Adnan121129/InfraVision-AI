# infravision-ml

Framework-agnostic structural-defect inference used by the InfraVision ML worker.
The Django application depends only on `infravision_ml.services.PredictionService`.

```python
from infravision_ml.config import MLSettings
from infravision_ml.services import build_prediction_service

service = build_prediction_service(MLSettings.from_env())   # INFERENCE_MODE=demo | pytorch
result = service.predict(open("deck.jpg", "rb").read(), on_stage=print)
print(result.model.is_demo, result.health_score, [d.to_dict() for d in result.detections])
```

| Module | Contents |
|---|---|
| `preprocessing/` | `PreprocessingStage` base class, `@register_stage`, ten built-in OpenCV stages, `PreprocessingPipeline` |
| `models/` | `DefectModel` contract, `HeuristicDemoModel` (demo, not a trained model), `TorchPatchClassifier`, backbones, `ModelCard`, `@register_model` factories |
| `inference/` | sliding-window tiling, tile merging + NMS, `SeverityClassifier`, health score, annotation |
| `services/` | `PreprocessingService`, `ModelService`, `PredictionService` |
| `training/` | `prepare_sdnet2018`, `train_patch_classifier` (transfer learning, writes `model.pt` + `model_card.json`) |

Install: `pip install -e ".[pytorch]"` (add `timm` for Xception and other timm backbones).
Tests: `pip install -r requirements.txt -r requirements-pytorch.txt pytest && pytest`.

See the repository README for training and deployment instructions.
