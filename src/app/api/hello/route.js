export async function GET() {
  try {
    return new NextResponse(JSON.json({ message: "Hello" }), {
      status: 200,
    });
  } catch (e) {
    console.log("e", e);
    return new Response(
      JSON.stringify({ message: "Error connecting to the database" }),
      {
        status: 500,
      }
    );
  }
}
