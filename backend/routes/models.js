// ==========================================
// Pixel Models Route: GET /api/models
// ==========================================

const express = require("express");
const router = express.Router();
const { MODELS, getModelAvailability } = require("../config/models");

router.get("/", (req, res) => {
    try {
        const availability = getModelAvailability();
        const modelList = Object.values(MODELS).map(model => ({
            id: model.id,
            name: model.display,
            provider: model.provider,
            badge: model.badge,
            description: model.description,
            capabilities: model.capabilities,
            available: availability[model.id]
        }));

        res.json({
            success: true,
            data: modelList
        });
    } catch (err) {
        console.error("Error fetching models:", err);
        res.status(500).json({
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "Failed to load model registry"
            }
        });
    }
});

module.exports = router;
