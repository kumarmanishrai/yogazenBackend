# YogaZen Backend

Backend server for **YogaZen** — Mindful Store & Yoga Learning Platform built with Node.js, Express, and MongoDB.

---

## 📊 Telemetry & ML Recommendation Dataset Export

YogaZen tracks user interactions (pageviews, active dwell time, variety selections, searches, cart actions, and purchases) to power personalized recommendation models.

Use the following endpoints to download or stream the aggregated training dataset for training your Machine Learning model:

### 1. Download as JSON
```http
GET http://localhost:5000/analytics/export-dataset
```
- **Content-Type**: `application/json`
- **Output**: Array of interaction vectors with metadata (`totalInteractions`, `distinctUsers`, `distinctProducts`).

### 2. Download as CSV (Excel / Pandas / Scikit-learn Ready)
```http
GET http://localhost:5000/analytics/export-dataset?format=csv
```
- **Content-Type**: `text/csv`
- **Filename**: `yogazen_recommendation_dataset.csv`
- **Headers**:
  ```csv
  user_id,product_id,product_title,category,interaction_score,total_views,total_clicks,in_cart,purchased,last_interaction
  ```

---

## 🧮 Interaction Score Weighting Formula

The interaction score is calculated using an implicit feedback weighting system:
- **Product View (<15s dwell)**: `+1.0`
- **Engaged Product View (≥15s dwell)**: `+2.5`
- **Search Click / Component Click**: `+2.0`
- **Variety Swatch Click**: `+2.5`
- **Add to Wishlist**: `+4.0`
- **Add to Cart**: `+6.0`
- **Completed Purchase**: `+10.0`
- **Remove from Cart**: `-2.0`
- **Remove from Wishlist**: `-1.5`

---

## 🤖 Connecting the ML Model Once Hosted

When your friend's recommendation model is deployed and ready to receive requests, enable it in `.env`:

```env
ENABLE_EXTERNAL_ML=true
ML_SERVICE_URL=https://your-friend-ml-api.example.com
```

### Request Payload Sent to the ML API:
```json
POST /predict
Content-Type: application/json

{
  "userId": "671e...",
  "sessionId": "ses_1730310000_abc123",
  "recentViewedProducts": ["prod_id_1", "prod_id_2"],
  "topCategories": ["Sound Healing", "Yoga Mats"],
  "limit": 6
}
```

### Expected Response from the ML API:
```json
{
  "success": true,
  "recommendedProductIds": [
    "6722883f3f019a3bb081e012",
    "6722883f3f019a3bb081e015",
    "6722883f3f019a3bb081e019"
  ]
}
```

---

## 🚀 Server Quickstart

```bash
# Install dependencies
npm install

# Run backend development server
npm run dev
# or
node index.js
```
The server will run on port `5000` (or `PORT` defined in `.env`).

