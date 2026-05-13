const { convertSql } = require('./db');
console.log(convertSql('SELECT u.*, s.name as school_name FROM user u LEFT JOIN school s ON u.school_id = s.id WHERE u.username = ?'));
