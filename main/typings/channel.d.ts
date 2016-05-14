type ChannelFromMain
    = 'yf:tweet'
    | 'yf:mentions'
    | 'yf:retweet-success'
    | 'yf:unretweet-success'
    | 'yf:like-success'
    | 'yf:unlike-success'
    | 'yf:update-status-success'
    | 'yf:my-account'
    | 'yf:my-account-update'
    | 'yf:delete-status'
    | 'yf:liked-status'
    | 'yf:connection-failure'
    | 'yf:rejected-ids'
    | 'yf:unrejected-ids'
    | 'yf:friends'
    | 'yf:api-failure';

type ChannelFromRenderer
    = 'yf:request-retweet'
    | 'yf:undo-retweet'
    | 'yf:request-like'
    | 'yf:destroy-like'
    | 'yf:update-status'
    | 'yf:destroy-status'
;