import { Request, Response, Router } from "express";
import { upload, imagekit } from "../config/Imagekit";
import pool from "../config/database";
import { getImageKitFileId } from "../utils/imageKitHelper";

const router = Router();

// Get all development app logos
router.get("/development-app-logos", async (req, res) => {
  console.log("GET request received for /development-app-logos"); // Add this line
  try {
    const result = await pool.query(
      "SELECT * FROM development_application_logos ORDER BY created_at DESC"
    );
    console.log("Query result:", result.rows); // Add this line
    res.json(result.rows);
  } catch (error) {
    console.error("Detailed error:", error); // Add this line
    console.error("Error fetching development app logos:", error);
    res.status(500).json({
      error: "Failed to fetch development app logos",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Create development app logo
router.post(
  "/development-app-logos",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Image file is required" });
        return;
      }

      // Upload image to ImageKit
      const uploadResponse = await imagekit.upload({
        file: req.file.buffer.toString("base64"),
        fileName: `dev-app-logo-${Date.now()}-${req.file.originalname}`,
        folder: "/development-app-logos",
      });

      // Insert into database
      const result = await pool.query(
        "INSERT INTO development_application_logos (image, file_id) VALUES ($1, $2) RETURNING *",
        [uploadResponse.url, uploadResponse.fileId]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating development app logo:", err);
      res.status(500).json({
        error: "Failed to create development app logo",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

// Update development app logo
router.put(
  "/development-app-logos/:id",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify logo exists
      const existingLogo = await pool.query(
        "SELECT * FROM development_application_logos WHERE id = $1",
        [id]
      );

      if (existingLogo.rows.length === 0) {
        res.status(404).json({ error: "Development app logo not found" });
        return;
      }

      let imageUrl = existingLogo.rows[0].image;
      let fileId = existingLogo.rows[0].file_id; // Ambil file_id dari database

      // Handle new image upload if provided
      if (req.file) {
        try {
          const uploadResponse = await imagekit.upload({
            file: req.file.buffer.toString("base64"),
            fileName: `dev-app-logo-${Date.now()}-${req.file.originalname}`,
            folder: "/development-app-logos",
          });

          // Delete old image if exists using file_id from database
          if (fileId) {
            try {
              await imagekit.deleteFile(fileId);
            } catch (deleteError) {
              console.warn("Failed to delete old image:", deleteError);
            }
          }

          imageUrl = uploadResponse.url;
          fileId = uploadResponse.fileId; // Update file_id dengan yang baru
        } catch (uploadError) {
          res.status(500).json({
            error: "Failed to upload new image",
            details:
              uploadError instanceof Error
                ? uploadError.message
                : "Unknown error",
          });
          return;
        }
      }

      // Update database with new file_id
      const query = `
        UPDATE development_application_logos 
        SET 
          image = COALESCE($1, image),
          file_id = COALESCE($2, file_id),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const values = [
        imageUrl || null,
        fileId || null, // Tambahkan file_id ke values
        id,
      ];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Development app logo not found" });
        return;
      }

      res.json({
        message: "Development app logo updated successfully",
        logo: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating development app logo:", err);
      res.status(500).json({
        error: "Failed to update development app logo",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

// Delete development app logo
router.delete(
  "/development-app-logos/:id",
  async (req: Request, res: Response) => {
    try {
      // First get the logo
      const logo = await pool.query(
        "SELECT * FROM development_application_logos WHERE id = $1",
        [req.params.id]
      );

      if (logo.rows.length === 0) {
        res.status(404).json({ error: "Development app logo not found" });
        return;
      }

      const fileId = logo.rows[0].file_id;

      // Delete both image and database record in parallel
      await Promise.all([
        // Delete from ImageKit if file_id exists
        fileId
          ? imagekit.deleteFile(fileId).catch((error) => {
              console.warn("Failed to delete image from ImageKit:", error);
            })
          : Promise.resolve(),

        // Delete from database
        pool.query(
          "DELETE FROM development_application_logos WHERE id = $1 RETURNING *",
          [req.params.id]
        ),
      ]);

      res.json({
        message: "Development app logo deleted successfully",
        logo: logo.rows[0],
      });
    } catch (err) {
      console.error("Error deleting development app logo:", err);
      res.status(500).json({
        error: "Failed to delete development app logo",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

export default router;
