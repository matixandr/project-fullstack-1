import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pair, buyAt, sellAt, amount } = await req.json();

  const strategy = await prisma.strategy.create({
    data: {
      userId: (session.user as any).id,
      pair,
      buyAt: buyAt ? parseFloat(buyAt) : null,
      sellAt: sellAt ? parseFloat(sellAt) : null,
      amount: amount ? parseFloat(amount) : 0.001,
      active: true,
    },
  });

  return NextResponse.json(strategy);
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const strategies = await prisma.strategy.findMany({
    where: { userId: (session.user as any).id, active: true },
  });

  return NextResponse.json(strategies);
}
