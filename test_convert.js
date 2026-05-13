const {convertSql} = require('./db.js');

const testQueries = [
  `SELECT u.*, s.name as school_name FROM user u LEFT JOIN school s ON u.school_id = s.id WHERE LOWER(u.username) = LOWER(?)`,
  `SELECT u.id, u.username, u.role, u.class_name, u.section_name, u.board_name, u.school_id, u.xp, u.streak, u.last_active_date, u.mapped_student_id, s.name as school_name FROM user u LEFT JOIN school s ON u.school_id = s.id WHERE u.id = ?`,
  `SELECT COUNT(id) as count FROM user WHERE school_id = ? AND role = 'STAFF'`,
  `SELECT id, username, role, class_name, section_name, board_name, usn, xp, streak, last_active_date FROM user WHERE school_id = ? AND role IN ('STAFF', 'STUDENT', 'PARENT') ORDER BY role, class_name, section_name, username`,
  `SELECT mapped_student_id, class_name, section_name, board_name FROM user WHERE id = ?`,
  `SELECT message, created_at FROM notification WHERE target_user_id = ? OR (target_user_id IS NULL AND target_role = ? AND (school_id = ? OR school_id IS NULL)) OR (target_user_id IS NULL AND target_role IS NULL AND (school_id = ? OR school_id IS NULL)) ORDER BY created_at DESC LIMIT 20`,
  `SELECT id FROM user WHERE role = 'PARENT' AND mapped_student_id = ?`,
  `UPDATE user SET streak = 0 WHERE id = ?`,
  `INSERT INTO notification (target_user_id, school_id, message) VALUES (?, ?, ?)`,
  `SELECT c.*, u.username as sender_name, u.role as sender_role FROM communication c JOIN "user" u ON c.sender_id = u.id WHERE c.sender_id = ? OR c.receiver_id = ? ORDER BY c.created_at ASC`,
];

testQueries.forEach((q, i) => {
  console.log(`Q${i}: ${convertSql(q)}`);
  console.log('---');
});
