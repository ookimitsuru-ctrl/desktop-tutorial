'use strict';

// Values with no source in the spec (README's own "未確定事項" section says
// targetGroupSize itself will be tuned while operating). Adjust here.
module.exports = {
  TARGET_GROUP_SIZE: 8,
  MAX_MESSAGE_LENGTH: 500,
  MIN_MESSAGE_INTERVAL_MS: 1000,
  RETENTION_DAYS: 30,
  REGION: 'asia-northeast1',
};
