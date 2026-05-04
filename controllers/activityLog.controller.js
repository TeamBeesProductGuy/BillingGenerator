const ActivityLogModel = require('../models/activityLog.model');
const catchAsync = require('../middleware/catchAsync');

const activityLogController = {
  list: catchAsync(async (req, res) => {
    const logs = await ActivityLogModel.findAll({
      q: req.query.q,
      module: req.query.module,
      action: req.query.action,
      limit: req.query.limit,
    });
    res.json({ success: true, data: logs });
  }),
};

module.exports = activityLogController;
