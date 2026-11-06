import fs from "node:fs";
const required = ["app/_layout.jsx", "src/config/app.config.js", "src/config/navigation.config.js", "src/services/bootstrap.service.js", "src/contexts/AuthContext.jsx", "src/screens/Home.jsx"];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Falta ${file}`);
console.log("Estructura cantapp-base: OK");
