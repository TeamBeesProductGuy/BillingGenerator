const router = require('express').Router();
const { supabase } = require('../config/database');
const catchAsync = require('../middleware/catchAsync');

router.get('/stats', catchAsync(async (req, res) => {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw new Error(error.message);
  res.json({ success: true, data });
}));

module.exports = router;
