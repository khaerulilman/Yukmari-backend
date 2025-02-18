import { Request, Response, Router } from "express";
import { upload, imagekit } from "../config/Imagekit";
import pool from "../config/database";
import { getImageKitFileId } from "../utils/imageKitHelper";

const router = Router();

router.get("/testimonial", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM testimonials ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching testimonials:", error);
    res.status(500).json({
      error: "Failed to fetch testimonials",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Create testimonial
router.post(
  "/testimonial",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Image file is required" });
        return;
      }

      if (!req.body.name || !req.body.university || !req.body.testimonial) {
        res.status(400).json({ error: "All fields are required" });
        return;
      }

      // Upload image to ImageKit
      const uploadResponse = await imagekit.upload({
        file: req.file.buffer.toString("base64"),
        fileName: `testimonial-${Date.now()}-${req.file.originalname}`,
        folder: "/testimonials",
      });

      // Insert into database
      const result = await pool.query(
        "INSERT INTO testimonials (name, university, testimonial, image , file_id) VALUES ($1, $2, $3, $4 , $5) RETURNING *",
        [
          req.body.name,
          req.body.university,
          req.body.testimonial,
          uploadResponse.url,
          uploadResponse.fileId,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating testimonial:", err);
      res.status(500).json({
        error: "Failed to create testimonial",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

// Update testimonial
router.put(
  "/testimonial/:id",
  upload.single("image"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify testimonial exists
      const existingTestimonial = await pool.query(
        "SELECT * FROM testimonials WHERE id = $1",
        [id]
      );

      if (existingTestimonial.rows.length === 0) {
        res.status(404).json({ error: "Testimonial not found" });
        return;
      }

      let imageUrl = existingTestimonial.rows[0].image;
      let fileId = existingTestimonial.rows[0].file_id; // Ambil file_id dari database

      // Handle new image upload if provided
      if (req.file) {
        try {
          const uploadResponse = await imagekit.upload({
            file: req.file.buffer.toString("base64"),
            fileName: `testimonial-${Date.now()}-${req.file.originalname}`,
            folder: "/testimonials",
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
        UPDATE testimonials 
        SET 
          name = COALESCE($1, name),
          university = COALESCE($2, university),
          testimonial = COALESCE($3, testimonial),
          image = COALESCE($4, image),
          file_id = COALESCE($5, file_id),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING *
      `;

      const values = [
        req.body.name || null,
        req.body.university || null,
        req.body.testimonial || null,
        imageUrl || null,
        fileId || null, // Tambahkan file_id ke values
        id,
      ];

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        res.status(404).json({ error: "Testimonial not found" });
        return;
      }

      res.json({
        message: "Testimonial updated successfully",
        testimonial: result.rows[0],
      });
    } catch (err) {
      console.error("Error updating testimonial:", err);
      res.status(500).json({
        error: "Failed to update testimonial",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
);

// Delete testimonial
router.delete("/testimonial/:id", async (req: Request, res: Response) => {
  try {
    // First get the testimonial
    const testimonial = await pool.query(
      "SELECT * FROM testimonials WHERE id = $1",
      [req.params.id]
    );

    if (testimonial.rows.length === 0) {
      res.status(404).json({ error: "Testimonial not found" });
      return;
    }

    const fileId = testimonial.rows[0].file_id; // Ambil file_id langsung dari database
    // Delete both image and database record in parallel
    // Delete both image and database record in parallel
    await Promise.all([
      // Delete from ImageKit if file_id exists
      fileId
        ? imagekit.deleteFile(fileId).catch((error) => {
            console.warn("Failed to delete image from ImageKit:", error);
          })
        : Promise.resolve(),

      // Delete from database
      pool.query("DELETE FROM testimonials WHERE id = $1 RETURNING *", [
        req.params.id,
      ]),
    ]);

    res.json({
      message: "Testimonial deleted successfully",
      testimonial: testimonial.rows[0],
    });
  } catch (err) {
    console.error("Error deleting testimonial:", err);
    res.status(500).json({
      error: "Failed to delete testimonial",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

export default router;
