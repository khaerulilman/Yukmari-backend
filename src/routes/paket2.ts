import { Router, Request, Response } from "express";
import pool from "../config/database";

const router = Router();

// GET all data from paket_2 table
router.get("/paket_2", async (req: Request, res: Response) => {
  try {
    const query = "SELECT * FROM paket_2 ORDER BY paket_2.id ASC";
    const result = await pool.query(query);

    res.status(200).json({
      message: "Data retrieved successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/paket_2/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { content_type, content } = req.body;

  try {
    const query = `
      UPDATE paket_2
      SET content_type = $1, content = $2
      WHERE id = $3
      RETURNING *;
    `;
    const values = [content_type, content, id];
    const result = await pool.query(query, values);

    if (result.rows.length > 0) {
      res.status(200).json({
        message: "Data updated successfully",
        data: result.rows[0],
      });
    } else {
      res.status(404).json({ message: "Data not found" });
    }
  } catch (error) {
    console.error("Error updating data:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
