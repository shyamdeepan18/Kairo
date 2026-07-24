import { db } from '../index.js';
import { companies, plants, companySettings } from '../schema/company.js';
import { costGroups } from '../schema/manufacturing.js';

async function seedCompany() {
  console.log('Seeding dummy company...');
  
  try {
    const [company] = await db.insert(companies).values({
      name: 'Dummy Manufacturing Co.',
      legalName: 'Dummy Manufacturing Private Limited',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      baseCurrency: 'INR',
      address: '123 Industrial Area',
      city: 'Bangalore',
      state: 'Karnataka',
      stateCode: '29',
      pincode: '560001'
    }).returning();
    
    console.log(`Successfully created company: ${company.name}`);

    const [plant] = await db.insert(plants).values({
      companyId: company.id,
      name: 'Main Plant',
      code: 'PL01',
      gstin: '29ABCDE1234F1Z5',
      address: '123 Industrial Area',
      city: 'Bangalore',
      state: 'Karnataka',
      stateCode: '29',
      pincode: '560001',
    }).returning();
    
    console.log(`Successfully created plant: ${plant.name}`);

    // Seed Company Settings
    await db.insert(companySettings).values({
      companyId: company.id,
      enableBackorders: true,
      enableQualityControl: false,
      allowNegativeStock: false,
      enforceStrictAccounting: true,
      grnInvoiceTolerancePct: '2.00',
    }).onConflictDoNothing();
    console.log(`Successfully created company settings`);

    // Seed Cost Groups
    await db.insert(costGroups).values([
      { companyId: company.id, code: 'MAT', name: 'Raw Material Cost', type: 'material' },
      { companyId: company.id, code: 'LAB', name: 'Direct Labor', type: 'labor' },
      { companyId: company.id, code: 'MAC', name: 'Machine Operations', type: 'machine' },
      { companyId: company.id, code: 'SUB', name: 'Subcontracting', type: 'subcontracting' },
      { companyId: company.id, code: 'OVH', name: 'Factory Overhead', type: 'overhead' }
    ]).onConflictDoNothing();
    console.log(`Successfully created standard cost groups`);

  } catch (err: any) {
    console.error('Error seeding company:', err);
  }
  
  process.exit(0);
}

seedCompany();

