import { kv } from '@vercel/kv';

export default async function handler(req, res) {
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
                return res.status(200).json({ data: savedData });
            }
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Database error' });
    }
}
