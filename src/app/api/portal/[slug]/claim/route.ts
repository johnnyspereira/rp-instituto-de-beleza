export async function POST() {
  return Response.json(
    {
      error:
        'O vínculo por sessão geral foi desativado. Use as credenciais exclusivas do Portal 360.',
    },
    { status: 410 }
  );
}
