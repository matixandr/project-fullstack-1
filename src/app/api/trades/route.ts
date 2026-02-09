import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pair, type, price, amount } = await req.json();

  const trade = await prisma.$transaction(async (tx: any) => {
    const trade = await tx.trade.create({
      data: {
        userId: (session.user as any).id,
        pair,
        type,
        price: parseFloat(price),
        amount: parseFloat(amount),
      },
    });

    const cost = parseFloat(price) * parseFloat(amount);

    await tx.user.update({
      where: { id: (session.user as any).id },
      data: {
        balance: {
          increment: type === "SELL" ? cost : -cost,
        },
      },
    });

    return trade;
  });

  return NextResponse.json(trade);
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trades = await prisma.trade.findMany({
    where: { userId: (session.user as any).id },
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json(trades);
}
