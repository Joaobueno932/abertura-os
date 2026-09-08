-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "cancellationReasonId" TEXT;

-- CreateTable
CREATE TABLE "ServiceOrderTechnician" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "responsibleId" TEXT,

    CONSTRAINT "ServiceOrderTechnician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationReason" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CancellationReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketSequence" (
    "day" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TicketSequence_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "UtilityTicket" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "expectedHoursCenti" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "protocol" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancellationReasonId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UtilityTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilityTicketEvent" (
    "id" TEXT NOT NULL,
    "utilityTicketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtilityTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceOrderTechnician_responsibleId_idx" ON "ServiceOrderTechnician"("responsibleId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrderTechnician_serviceOrderId_position_key" ON "ServiceOrderTechnician"("serviceOrderId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationReason_label_key" ON "CancellationReason"("label");

-- CreateIndex
CREATE INDEX "CancellationReason_active_label_idx" ON "CancellationReason"("active", "label");

-- CreateIndex
CREATE UNIQUE INDEX "UtilityTicket_number_key" ON "UtilityTicket"("number");

-- CreateIndex
CREATE INDEX "UtilityTicket_status_idx" ON "UtilityTicket"("status");

-- CreateIndex
CREATE INDEX "UtilityTicket_openedAt_idx" ON "UtilityTicket"("openedAt");

-- CreateIndex
CREATE INDEX "UtilityTicket_dueAt_idx" ON "UtilityTicket"("dueAt");

-- CreateIndex
CREATE INDEX "UtilityTicket_institutionId_idx" ON "UtilityTicket"("institutionId");

-- CreateIndex
CREATE INDEX "UtilityTicket_responsibleId_idx" ON "UtilityTicket"("responsibleId");

-- CreateIndex
CREATE INDEX "UtilityTicket_plantId_idx" ON "UtilityTicket"("plantId");

-- CreateIndex
CREATE INDEX "UtilityTicket_status_dueAt_idx" ON "UtilityTicket"("status", "dueAt");

-- CreateIndex
CREATE INDEX "UtilityTicket_createdById_idx" ON "UtilityTicket"("createdById");

-- CreateIndex
CREATE INDEX "UtilityTicket_cancellationReasonId_idx" ON "UtilityTicket"("cancellationReasonId");

-- CreateIndex
CREATE INDEX "UtilityTicketEvent_utilityTicketId_createdAt_idx" ON "UtilityTicketEvent"("utilityTicketId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_cancellationReasonId_idx" ON "ServiceOrder"("cancellationReasonId");

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_cancellationReasonId_fkey" FOREIGN KEY ("cancellationReasonId") REFERENCES "CancellationReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderTechnician" ADD CONSTRAINT "ServiceOrderTechnician_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderTechnician" ADD CONSTRAINT "ServiceOrderTechnician_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Responsible"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicket" ADD CONSTRAINT "UtilityTicket_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicket" ADD CONSTRAINT "UtilityTicket_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicket" ADD CONSTRAINT "UtilityTicket_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Responsible"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicket" ADD CONSTRAINT "UtilityTicket_cancellationReasonId_fkey" FOREIGN KEY ("cancellationReasonId") REFERENCES "CancellationReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicket" ADD CONSTRAINT "UtilityTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicket" ADD CONSTRAINT "UtilityTicket_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicketEvent" ADD CONSTRAINT "UtilityTicketEvent_utilityTicketId_fkey" FOREIGN KEY ("utilityTicketId") REFERENCES "UtilityTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityTicketEvent" ADD CONSTRAINT "UtilityTicketEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

