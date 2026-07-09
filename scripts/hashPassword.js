const bcrypt = require("bcryptjs");

const password = "Admin@2026";
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);

console.log("Password:", password);
console.log("Hash:", hash);
console.log("");
console.log("Run this SQL in your MySQL client:");
console.log("");
console.log(`USE inventory_dashboard;`);
console.log("");
console.log(`INSERT INTO users (employee_id, name, email, password_hash, role_id, department_id) VALUES ('302625', 'aiteam', 'ai@rattanindia.com', '${hash}', 1, NULL);`);
