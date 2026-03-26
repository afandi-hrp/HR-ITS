import axios from 'axios';

async function test() {
  try {
    const res = await axios.get('http://localhost:3000/api/cv-uploads');
    console.log(res.status);
    console.log(res.data);
  } catch (err: any) {
    console.error(err.response?.status);
    console.error(err.response?.data);
  }
}

test();
