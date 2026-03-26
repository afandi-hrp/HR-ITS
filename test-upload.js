import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testUpload() {
  const form = new FormData();
  form.append('candidateName', 'Test User');
  form.append('candidateEmail', 'test@example.com');
  form.append('candidatePosition', 'Developer');
  form.append('fileName', 'test.pdf');
  form.append('mimeType', 'application/pdf');
  form.append('file', Buffer.from('dummy pdf content'), {
    filename: 'test.pdf',
    contentType: 'application/pdf',
  });

  try {
    const response = await fetch('http://localhost:3000/api/n8n/upload-cv', {
      method: 'POST',
      body: form,
    });

    console.log('Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));
    const text = await response.text();
    console.log('Body:', text.substring(0, 500));
  } catch (err) {
    console.error('Error:', err);
  }
}

testUpload();
