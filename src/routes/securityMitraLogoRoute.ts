import { Request, Response, Router } from "express";
import { upload, imagekit } from "../config/Imagekit";
import pool from "../config/database";
import { getImageKitFileId } from "../utils/imageKitHelper";

const router = Router();

router.get("/security-mitra-logos", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM security_mitra_logos ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching security mitra logos:", error);
    res.status(500).json({
      error: "Failed to fetch security mitra logos",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post(
  "/security-mitra-logos",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Image file is required" });
        return;
      }

      const uploadResponse = await imagekit.upload({
        file: req.file.buffer.toString("base64"),
        fileName: `security-mitra-logo-${Date.now()}-${req.file.originalname}`,
        folder: "/security-mitra-logos",
      });

      const result = await pool.query(
        "INSERT INTO security_mitra_logos (image, file_id) VALUES ($1,$2) RETURNING *",
        [uploadResponse.url, uploadResponse.fileId]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating security mitra logo:", err);
      res.status(500).json({
        error: "Failed to create security mitra logo",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

router.put(
  "/security-mitra-logos/:id",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify security mitra logo exists
      const existingLogo = await pool.query(
        "SELECT * FROM security_mitra_logos WHERE id = $1",
        [id]
      );

      if (existingLogo.rows.length === 0) {
        res.status(404).json({ error: "Security mitra logo not found" });
        return;
      }

      let imageUrl = existingLogo.rows[0].image;
      let fileId = existingLogo.rows[0].file_id; // Ambil file_id dari database

      // Handle new image upload if provided
      if (req.file) {
        try {
          const uploadResponse = await imagekit.upload({
            file: req.file.buffer.toString("base64"),
            fileName: `security-mitra-logo-${Date.now()}-${
              req.file.originalname
            }`,
            folder: "/security-mitra-logos",
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
        UPDATE security_mitra_logos 
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
        res.status(404).json({ error: "Security mitra logo not found" });
        return;
      }

      res.json({
        message: "Security mitra logo updated successfully",
        logo: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating security mitra logo:", err);
      res.status(500).json({
        error: "Failed to update security mitra logo",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

router.delete(
  "/security-mitra-logos/:id",
  async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        "DELETE FROM security_mitra_logos WHERE id = $1 RETURNING *",
        [req.params.id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Security mitra logo not found" });
        return;
      }

      const fileId = result.rows[0].file_id;

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
          "DELETE FROM security_mitra_logos WHERE id = $1 RETURNING *",
          [req.params.id]
        ),
      ]);

      res.json({
        message: "Security mitra logo deleted successfully",
        logo: result.rows[0],
      });
    } catch (err) {
      console.error("Error deleting security mitra logo:", err);
      res.status(500).json({
        error: "Failed to delete security mitra logo",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

export default router;
