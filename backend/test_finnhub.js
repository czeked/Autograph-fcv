import axios from 'axios';
import 'dotenv/config';

async function test() {
    try {
        const symbol = 'AAPL';
        const fromDate = '2020-01-01';
        const toDate = '2020-02-01';
        const res = await axios.get(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromDate}&to=${toDate}&token=${process.env.FINNHUB_API_KEY}`);
        
        console.log(`News count for ${fromDate} to ${toDate}:`, res.data.length);
        if (res.data.length > 0) {
            console.log("Sample:", res.data[0].headline);
        }
    } catch (e) {
        console.error("ERROR:", e.response ? e.response.data : e.message);
    }
}
test();
