const bcrypt = require('bcryptjs');
const Admin = require('../models/adminSchema');

/**
 * Bootstrap Superadmin
 * Ensures single root superadmin always exists with full permissions.
 */
const seedSuperAdmin = async () => {
  try {
    const hashedPassword = await bcrypt.hash('654321', 10);
    let superAdmin = await Admin.findOne({
      $or: [{ role: 'superadmin' }, { email: 'superadmin@yogazen.com' }, { username: 'superadmin' }]
    });

    if (!superAdmin) {
      superAdmin = await Admin.create({
        name: 'Chief Super Administrator',
        username: 'superadmin',
        email: 'superadmin@yogazen.com',
        password: hashedPassword,
        contact: '+91 98765 43210',
        role: 'superadmin',
        permissions: ['all', 'inventory', 'complaints', 'orders', 'crm', 'trainers', 'financials', 'admins', 'audit'],
        isActive: true
      });
      console.log('👑 Superadmin initialized successfully.');
    } else {
      superAdmin.name = superAdmin.name || 'Chief Super Administrator';
      superAdmin.username = 'superadmin';
      superAdmin.role = 'superadmin';
      superAdmin.password = hashedPassword;
      superAdmin.isActive = true;
      superAdmin.permissions = ['all', 'inventory', 'complaints', 'orders', 'crm', 'trainers', 'financials', 'admins', 'audit'];
      await superAdmin.save();
      console.log('👑 Superadmin synchronized successfully.');
    }
  } catch (err) {
    console.error('Error seeding superadmin:', err.message);
  }
};

module.exports = seedSuperAdmin;

