import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const campaignsData = [
  { name: "HB ANIV NÃO ATENDE NOV-DEZ 2025.01", date: "08/01/2026 09:35", month: "D01-Jan" },
  { name: "HB ANIV NÃO ATENDE NOV-DEZ 2025.02", date: "09/01/2026 10:00", month: "D02-Jan" },
  { name: "HB ANIV NÃO ATENDE NOV-DEZ 2025.03", date: "12/01/2026 09:03", month: "D03-Jan" },
  { name: "HB ANIV NÃO ATENDE JAN.2026 MGS.TC006.01", date: "13/01/2026 09:42", month: "D04-Jan" },
  { name: "HB ANIV NÃO ATENDE JAN.2026 MGS.TC006.02", date: "13/01/2026 14:34", month: "D05-Jan" },
  { name: "HB ANIV NÃO ATENDE JAN.2026 MGS.TC006.03", date: "15/01/2026 10:02", month: "D06-Jan" },
  { name: "HB ANIV NÃO ATENDE JAN.2026 MGS.TC006.04", date: "16/01/2026 10:53", month: "D07-Jan" },
  { name: "HB ANIV NÃO ATENDE NOV-DEZ 2025.04", date: "19/01/2026 14:44", month: "D08-Jan" },
  { name: "HB ANIV NÃO ATENDE NOV-DEZ 2025.05", date: "20/01/2026 14:16", month: "D09-Jan" },
  { name: "HB ANIV NÃO ATENDE OUT 2025.01", date: "21/01/2026 14:31", month: "D10-Jan" },
  { name: "HB ANIV NÃO ATENDE OUT 2025.02", date: "22/01/2026 09:40", month: "D11-Jan" },
  { name: "HB ANIV NÃO ATENDE SET 2025.01", date: "23/01/2026 14:04", month: "D12-Jan" },
  { name: "HB ANIV 9MESES FEV 2026.01", date: "26/01/2026 10:54", month: "D13-Jan" },
  { name: "HB ANIV 9MESES FEV 2026.02", date: "27/01/2026 14:42", month: "D14-Jan" },
  { name: "HB ANIV 9MESES FEV 2026.03", date: "28/01/2026 11:02", month: "D15-Jan" },
  { name: "HB ANIV 9MESES FEV 2026.04", date: "29/01/2026 13:44", month: "D16-Jan" },
  { name: "HB ANIV 9MESES FEV 2026.05", date: "30/01/2026 11:30", month: "D17-Jan" },
  { name: "HB ANIV 9MESES FEV 2026.06", date: "04/02/2026 09:42", month: "D01-Fev" },
  { name: "HB ANIV 9MESES FEV 2026.07", date: "06/02/2026 09:14", month: "D02-Fev" },
  { name: "HB ANIV 9MESES FEV 2026.08", date: "10/02/2026 09:31", month: "D03-Fev" },
  { name: "HB ANIV 9MESES FEV 2026.09", date: "11/02/2026 10:04", month: "D04-Fev" },
  { name: "HB ANIV NÃO ATENDE SET 2025.02", date: "12/02/2026 13:33", month: "D05-Fev" },
  { name: "HB ANIV NÃO ATENDE SET 2025.03", date: "19/02/2026 09:51", month: "D06-Fev" },
  { name: "HB NÃO ATENDE JAN 2026.01", date: "24/02/2026 09:17", month: "D07-Fev" },
  { name: "HB ANIV 9MESES MAR 2026.01", date: "26/02/2026 10:14", month: "D08-Fev" },
  { name: "HB ANIV 9MESES MAR 2026.02", date: "27/02/2026 09:46", month: "D09-Fev" },
  { name: "HB ANIV 9MESES MAR 2026.03", date: "02/03/2026 10:19", month: "D01-Mar" },
  { name: "HB ANIV 9MESES MAR 2026.04", date: "03/03/2026 15:14", month: "D02-Mar" },
  { name: "HB ANIV 9MESES MAR 2026.05", date: "05/03/2026 11:01", month: "D03-Mar" },
  { name: "RESGATE 2023 NÃO ATENDE.01", date: "11/03/2026 09:02", month: "D04-Mar" },
  { name: "RESGATE 2023 NÃO ATENDE.02", date: "12/03/2026 09:04", month: "D05-Mar" },
  { name: "RESGATE 2023 NÃO ATENDE.03", date: "12/03/2026 14:26", month: "D06-Mar" },
  { name: "RESGATE 2023 NÃO ATENDE.04", date: "13/03/2026 09:02", month: "D07-Mar" },
];

(async () => {
    const db = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    for (const c of campaignsData) {
        // Parse the dates like "08/01/2026 09:35"
        const [dateStr, timeStr] = c.date.split(' ');
        
        // Month like "D01-Jan" -> Jan
        const refMonthParts = c.month.split('-');
        let refMonth = refMonthParts[1] || 'Jan';
        
        // Number is 1
        let number = 1;
        if (refMonthParts[0].startsWith('D')) {
            number = parseInt(refMonthParts[0].replace('D', ''), 10);
        }

        // Only insert if it doesn't already exist (simple check by name)
        const existing = await db.get('SELECT id FROM campaigns WHERE name = ?', [c.name]);
        if (!existing) {
            await db.run(
                'INSERT INTO campaigns (name, date, time, reference_month, number) VALUES (?, ?, ?, ?, ?)',
                [c.name, dateStr, timeStr, refMonth, number]
            );
            console.log(`Inserido: ${c.name}`);
        } else {
            console.log(`Pulado (já existe): ${c.name}`);
        }
    }
    
    console.log("Migração concluída!");
})();
