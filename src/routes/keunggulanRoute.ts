import { Router, Request, Response } from "express";
import pool from "../config/database";

const router = Router();

// GET all data from keunggulan_kami table
router.get("/keunggulan-kami", async (req: Request, res: Response) => {
  try {
    const query =
      "SELECT * FROM keunggulan_kami ORDER BY keunggulan_kami.id ASC";
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

router.put("/keunggulan-kami/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { content_type, content } = req.body;

  try {
    const query = `
      UPDATE keunggulan_kami
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
