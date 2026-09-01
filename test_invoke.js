import { invoke } from '@tauri-apps/api';

invoke('audit_log', { limit: 5 }).then(result => {
    console.log('Result:', result);
}).catch(err => {
    console.error('Error:', err);
});