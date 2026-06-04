// Seed defaults so day-1 isn't completely uncategorized. Admin can override
// any of these from the Settings UI. Keys are the lowercased app name as
// returned by active-win on macOS / Windows.
module.exports = {
  productive: [
    'code', 'visual studio code', 'webstorm', 'intellij idea', 'pycharm',
    'xcode', 'android studio', 'sublime text', 'cursor', 'rider',
    'iterm2', 'terminal', 'warp', 'hyper',
    'figma', 'sketch', 'adobe photoshop', 'adobe illustrator', 'adobe xd',
    'docker desktop', 'postman', 'insomnia', 'tableplus', 'dbngin',
    'notion', 'obsidian', 'linear', 'jira', 'confluence', 'asana', 'trello',
    'google docs', 'google sheets', 'google slides', 'microsoft word', 'microsoft excel', 'microsoft powerpoint',
    'slack', 'microsoft teams', 'zoom', 'google meet', 'webex',
    'github desktop', 'github', 'gitlab', 'bitbucket', 'fork', 'sourcetree'
  ],
  neutral: [
    'google chrome', 'safari', 'firefox', 'arc', 'brave browser', 'microsoft edge',
    'mail', 'gmail', 'outlook', 'thunderbird',
    'finder', 'system settings', 'system preferences',
    'whatsapp', 'whatsapp web', 'messages', 'telegram',
    'spotify', 'apple music' // background music while working
  ],
  unproductive: [
    'instagram', 'tiktok', 'reels', 'facebook', 'snapchat', 'pinterest',
    'twitter', 'x',
    'reddit', 'youtube',
    'netflix', 'prime video', 'disney+', 'hotstar', 'hulu', 'jio cinema',
    'twitch', 'discord',
    'amazon', 'flipkart', 'myntra', 'meesho', 'ajio',
    'minecraft', 'steam', 'epic games', 'fortnite'
  ]
};
