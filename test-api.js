async function test() {
  const res = await fetch('http://localhost:3000/api/cv-uploads');
  console.log("STATUS:", res.status);
  console.log("CONTENT-TYPE:", res.headers.get('content-type'));
  const text = await res.text();
  console.log("BODY:", text.substring(0, 100));
}
test();
