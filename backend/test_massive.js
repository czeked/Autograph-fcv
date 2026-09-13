import axios from 'axios';
import 'dotenv/config';

async function test() {
    try {
        const symbol = 'AAPL';
        const fromDate = '2021-01-01';
        const toDate = '2021-02-01';
        const res = await axios.get(`https://api.massive.com/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?apiKey=${process.env.MASSIVE_API_KEY}`);
        
        console.log(`Prices count for ${fromDate} to ${toDate}:`, res.data.results ? res.data.results.length : 0);
    } catch (e) {
        console.error("ERROR:", e.response ? e.response.data : e.message);
    }
}
test();
