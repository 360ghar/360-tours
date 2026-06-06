# Auto Hotspot Placement (AI)

This feature describes AI suggestions for hotspot creation and placement.

Status: **MVP** (opt-in)

Related docs:
- Hotspot schema: `../00-conventions.md`
- API contract: `../technical/api-specification.md`

## Goals

- Suggest hotspot candidates (type + position + content) for a scene or tour.
- Reduce manual hotspot placement time.

## Inputs

- `tour_id` or `scene_id`
- Optional: constraints (max hotspots per scene, preferred hotspot types)

## Outputs

AI output MUST be compatible with `Hotspot` and typed `HotspotContent`:

- `type`
- `position` (`yaw`, `pitch`)
- `target_scene_id` for navigation hotspots
- `content` with `kind` matching the type

## Workflow

1. User requests suggestions.
2. Backend creates AI job (`job_type=hotspot_suggestions`).
3. Client polls until completion.
4. User reviews suggestions and selects which to apply.
5. Selected hotspots are created via normal hotspot CRUD endpoints.

## API usage

- Create job: `POST /api/v1/ai/jobs`
- Poll job: `GET /api/v1/ai/jobs/{job_id}`
- Apply: `POST /api/v1/scenes/{scene_id}/hotspots`

## Safety

- Validate all generated URLs.
- Sanitize any HTML.

**Document Links**:
- [Scene Detection & Analysis](scene-detection.md) ← Previous
- [Tech Stack](tech-stack.md) → Next

- **Navigation hotspots**: Assigned to doors, entrances, exits, hallways, and corridors
- **Information hotspots**: Assigned to appliances, fixtures, equipment, and devices
- **Media hotspots**: Assigned to TVs, screens, monitors, pictures, and artwork

Objects not matching these categories default to information hotspots.

### 3. Performance Prediction and Optimization

The Hotspot Performance Predictor uses machine learning models trained on historical engagement data to forecast how well each hotspot placement will perform.

**Performance Prediction Process**

For each generated hotspot, the system extracts prediction features, makes ML-based predictions, retrieves historical performance statistics for comparison, calculates confidence intervals, and generates actionable insights. The prediction output includes expected click-through rate, engagement time, conversion rate, confidence intervals, historical comparisons, and recommended placement optimizations.

**Feature Extraction for Prediction**

Prediction features are organized into several categories:

- **Position features**: Yaw and pitch coordinates of the hotspot
- **Content features**: Description length, presence of media suggestions, and tag availability
- **Type features**: One-hot encoded hotspot type (navigation, information, or media)
- **Context features**: Room size, scene complexity, and time of day
- **Historical features**: Past performance data for similar hotspots when available

**Performance Insights Generation**

The system compares predictions against historical averages to provide contextual insights. If predicted click-through rate exceeds historical averages by more than two percentage points, the system notes expected above-average performance. Conversely, predictions significantly below average trigger optimization suggestions.

Specific insight thresholds include:
- High CTR (above 10%): Strong engagement potential noted
- Low CTR (below 3%): Content optimization recommended
- High engagement time (above 45 seconds): Users likely to explore content fully
- Low engagement time (below 15 seconds): More compelling content needed

Room-specific insights are also generated, such as increased food-related hotspot engagement in kitchens or reduced overall interaction frequency in bathrooms.

**Placement Optimization**

The optimization service analyzes current hotspot placements and generates improvement suggestions. For each hotspot, the system predicts current performance, generates alternative positions, evaluates each alternative's predicted performance, and calculates improvement scores.

Optimization suggestions are generated when an alternative position offers at least ten percent improvement over the current placement. The system provides the current and suggested positions, the improvement percentage, and reasoning for the recommendation.

**Improvement Score Calculation**

Improvement between current and alternative placements is calculated as a weighted combination of three metrics:

- Click-through rate improvement (40% weight)
- Engagement time improvement (30% weight)
- Conversion rate improvement (30% weight)

The final improvement score is normalized to a range of negative one to positive one, where positive values indicate improvement and negative values indicate degradation.

## Continuous Learning System

### 1. Machine Learning Improvement

The ML Improvement Service manages model enhancement through new performance data, ensuring the placement algorithms improve over time.

**Model Improvement Workflow**

When new performance data becomes available, the service processes and preprocesses the data, adds it to the training dataset, and assesses whether full model retraining is needed. If retraining thresholds are met, the system retrains the model, validates improvements, and deploys the new version. Otherwise, incremental updates are applied to incorporate new learnings without full retraining.

**Performance Data Processing**

Each performance data point is converted into a training example with extracted features, outcome labels, confidence weights, metadata, and timestamps. Feature extraction covers position, content characteristics, context, performance metrics, and user attributes.

**Feature Categories for Training**

Training examples include features across multiple categories:

- **Position features**: Yaw and pitch coordinates
- **Content features**: Content type, text length, and media presence
- **Context features**: Room type, time of day, and day of week
- **Performance features**: Click-through rate, engagement time, and conversion rate
- **User features**: Device type, location, and user segment

**Retraining Assessment**

The system continuously monitors for conditions that warrant model retraining. Two primary metrics drive this assessment: data drift and performance degradation. If either metric exceeds a fifteen percent threshold, full model retraining is triggered. Below this threshold, incremental updates are applied to incorporate new data without the computational cost of full retraining.

**Incremental Model Updates**

Incremental updates load the current production model, apply online learning with new training examples, calculate improvement metrics comparing old and updated models, validate the update against held-out data, and deploy the incrementally improved model. This approach allows the system to continuously improve while maintaining stable performance.

---

**Document Links**:
- [Scene Detection](scene-detection.md) ← Previous: Scene analysis and optimization
- [Auto Hotspot Placement](auto-hotspot-placement.md) ← Current: Intelligent hotspot suggestions
- [Tech Stack](tech-stack.md) → Next: Implementation details and technology choices
