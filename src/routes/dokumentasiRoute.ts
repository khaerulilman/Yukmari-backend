import { Request, Response, Router } from "express";
import { upload, imagekit } from "../config/Imagekit";
import pool from "../config/database";
import { getImageKitFileId } from "../utils/imageKitHelper";

const router = Router();

router.get("/dokumentasi", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM dokumentasi ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching dokumentasi:", error);
    res.status(500).json({
      error: "Failed to fetch dokumentasi",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post(
  "/dokumentasi",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Image file is required" });
        return;
      }

      const uploadResponse = await imagekit.upload({
        file: req.file.buffer.toString("base64"),
        fileName: `dokumentasi-${Date.now()}-${req.file.originalname}`,
        folder: "/dokumentasi",
      });

      const result = await pool.query(
        "INSERT INTO dokumentasi (image, file_id) VALUES ($1, $2) RETURNING *",
        [uploadResponse.url, uploadResponse.fileId]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating dokumentasi:", err);
      res.status(500).json({
        error: "Failed to create dokumentasi",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

router.put(
  "/dokumentasi/:id",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify dokumentasi exists
      const existingDokumentasi = await pool.query(
        "SELECT * FROM dokumentasi WHERE id = $1",
        [id]
      );

      if (existingDokumentasi.rows.length === 0) {
        res.status(404).json({ error: "Dokumentasi not found" });
        return;
      }

      let imageUrl = existingDokumentasi.rows[0].image;
      let fileId = existingDokumentasi.rows[0].file_id; // Ambil file_id dari database

      // Handle new image upload if provided
      if (req.file) {
        try {
          const uploadResponse = await imagekit.upload({
            file: req.file.buffer.toString("base64"),
            fileName: `dokumentasi-${Date.now()}-${req.file.originalname}`,
            folder: "/dokumentasi",
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
      } else {
        res.status(400).json({ error: "Image file is required" });
        return;
      }

      // Update database with new file_id
      const query = `
        UPDATE dokumentasi 
        SET 
          image = $1,
          file_id = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;

      const values = [imageUrl, fileId, id];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Dokumentasi not found" });
        return;
      }

      res.json({
        message: "Dokumentasi updated successfully",
        dokumentasi: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating dokumentasi:", err);
      res.status(500).json({
        error: "Failed to update dokumentasi",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

router.delete("/dokumentasi/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const dokumentasi = await pool.query(
      "SELECT * FROM dokumentasi WHERE id = $1",
      [id]
    );

    if (dokumentasi.rows.length === 0) {
      res.status(404).json({ error: "Dokumentasi not found" });
      return;
    }

    const fileId = dokumentasi.rows[0].file_id;

    await Promise.all([
      // Delete from ImageKit if file_id exists
      fileId
        ? imagekit.deleteFile(fileId).catch((error) => {
            console.warn("Failed to delete image from ImageKit:", error);
          })
        : Promise.resolve(),

      // Delete from database
      pool.query("DELETE FROM dokumentasi WHERE id = $1 RETURNING *", [
        req.params.id,
      ]),
    ]);

    res.json({
      message: "Dokumentasi deleted successfully",
      dokumentasi: dokumentasi.rows[0],
    });
  } catch (err) {
    console.error("Error deleting dokumentasi:", err);
    res.status(500).json({
      error: "Failed to delete dokumentasi",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;
