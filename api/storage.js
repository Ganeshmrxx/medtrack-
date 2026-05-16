import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // Check if KV is connected in Vercel
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
        return res.status(400).json({ 
            error: 'Database not connected', 
            details: 'Please click "Connect" in Vercel Storage dashboard for this project.' 
        });
    }

    if (!req.body) {
        return res.status(400).json({ error: 'Body missing' });
    }

    const { userId, action, data } = req.body;

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
