const { initDb, getPool } = require('./db.js');

(async () => {
    try {
        await initDb();
        console.log('\n=== DATABASE VERIFICATION ===\n');
        const pool = getPool();
        
        // Check users
        const { rows: users } = await pool.query('SELECT id, username, role, school_id, class_name, mapped_student_id, xp, streak FROM "user" ORDER BY role, id');
        console.log('Users in DB:');
        users.forEach(u => {
            console.log(`  [${u.role}] id=${u.id} "${u.username}" school=${u.school_id} class=${u.class_name} mapped_student=${u.mapped_student_id} xp=${u.xp} streak=${u.streak}`);
        });
        
        // Check schools
        const { rows: schools } = await pool.query('SELECT * FROM school ORDER BY id');
        console.log('\nSchools:', schools);
        
        // Check parent-student mappings
        const parents = users.filter(u => u.role === 'PARENT');
        for (const p of parents) {
            if (p.mapped_student_id) {
                const { rows: [student] } = await pool.query('SELECT username FROM "user" WHERE id = $1', [p.mapped_student_id]);
                console.log(`\nParent "${p.username}" → mapped to student "${student?.username || 'NOT FOUND'}"`);
            } else {
                console.log(`\n⚠️ Parent "${p.username}" → NO STUDENT MAPPED`);
            }
        }
        
        // Check principal school
        const principals = users.filter(u => u.role === 'PRINCIPAL');
        for (const p of principals) {
            const { rows: schoolStudents } = await pool.query('SELECT COUNT(*) as c FROM "user" WHERE role = $1 AND school_id = $2', ['STUDENT', p.school_id]);
            console.log(`\nPrincipal "${p.username}" → school_id=${p.school_id} → ${schoolStudents[0].c} students in school`);
        }
        
        console.log('\n=== VERIFICATION COMPLETE ===');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
})();
