import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    const hasKV = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
    
    if (!hasKV) {
        return res.status(400).json({ 
            error: 'Database not connected', 
            details: 'Please ensure KV is connected in Vercel Storage dashboard.' 
        });
    }

    if (!req.body) {
        return res.status(400).json({ error: 'Body missing' });
    }

    const { userId, action, data, accessKey } = req.body;

    // Security Check: Verify Private Key
    const PRIVATE_KEY = process.env.Prvt_key;
    
    if (accessKey !== PRIVATE_KEY) {
        return res.status(401).json({ 
            error: 'Unauthorized', 
            details: 'Invalid or missing private access key. Cloud sync is disabled for demo users.' 
        });
    }

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    try {
        if (req.method === 'POST') {
            if (action === 'save') {
                await kv.set(`medtrack:${userId}`, data);
                return res.status(200).json({ success: true });
            } 
            if (action === 'load') {
                const savedData = await kv.get(`medtrack:${userId}`);
                return res.status(200).json({ data: savedData || [] });
            }
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('KV Storage Error:', error);
        return res.status(500).json({ 
            error: 'Database error', 
            details: error.message 
        });
    }
}

