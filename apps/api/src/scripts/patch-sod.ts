import fs from 'fs';
import path from 'path';

const files = [
  '/Users/shyam18/SEGA/ERP/apps/api/src/routes/purchase.ts',
  '/Users/shyam18/SEGA/ERP/apps/api/src/routes/sales.ts',
  '/Users/shyam18/SEGA/ERP/apps/api/src/routes/manufacturing.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace ApprovalEngine.act calls
  content = content.replace(
    /app\.approvalEngine\.act\(\s*tx,\s*req\.id,\s*uid,\s*'approved',\s*remarks(?:,\s*\{([^}]*)\})?\s*\)/g,
    (match, options) => {
      const opts = options ? options.trim() : '';
      const newOpts = opts ? `{ ${opts}, bypassSod }` : '{ bypassSod }';
      return `app.approvalEngine.act(tx, req.id, uid, 'approved', remarks, ${newOpts})`;
    }
  );

  content = content.replace(
    /app\.approvalEngine\.act\(\s*tx,\s*req\.id,\s*uid,\s*cfg\.to as 'approved' \| 'rejected',\s*remarks(?:,\s*\{([^}]*)\})?\s*\)/g,
    (match, options) => {
      const opts = options ? options.trim() : '';
      const newOpts = opts ? `{ ${opts}, bypassSod }` : '{ bypassSod }';
      return `app.approvalEngine.act(tx, req.id, uid, cfg.to as 'approved' | 'rejected', remarks, ${newOpts})`;
    }
  );

  // Insert const bypassSod = ... right after const uid = userId(request);
  // Careful not to insert it multiple times.
  content = content.replace(
    /const uid = userId\(request\);\n(?!\s*const bypassSod)/g,
    "const uid = userId(request);\n    const bypassSod = await app.permissionService.check(uid, 'system.bypass_sod', cid);\n"
  );

  // Update validateMakerChecker calls
  content = content.replace(
    /!app\.permissionService\.validateMakerChecker\(uid,\s*([a-zA-Z0-9_.]+),\s*([a-zA-Z0-9_.]+)\)/g,
    '!app.permissionService.validateMakerChecker(uid, $1, $2, bypassSod)'
  );

  fs.writeFileSync(file, content);
  console.log(`Patched ${path.basename(file)} successfully`);
}
