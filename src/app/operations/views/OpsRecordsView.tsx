"use client";

import {
  dateLabel,
  money,
  studentName,
  text,
  type OperationsData,
} from "../ops-types";

export interface OpsRecordsViewProps {
  data: OperationsData;
  isOwner: boolean;
  profileId: string;
  canBilling: boolean;
  canSeeEvents: boolean;
}

export default function OpsRecordsView({
  data,
  isOwner,
  profileId,
  canBilling,
  canSeeEvents,
}: OpsRecordsViewProps) {
  return (
    <div className="ops-view-group" role="group" aria-label="Records work area">
      {canBilling && (
        <section
          className="ops-section span-12"
          aria-labelledby="payments-title"
        >
          <div className="ops-section-head">
            <div>
              <h2 id="payments-title">Payment status</h2>
            </div>
          </div>
          {data.payments.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Amount</th>
                    <th>Due</th>
                    <th>Bucket</th>
                    <th>Overdue days</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        {text(
                          payment.payload.studentName,
                          studentName(
                            data.students.find(
                              (student) => student.id === payment.student_id
                            )
                          )
                        )}
                      </td>
                      <td>
                        {payment.payload.currency
                          ? money(
                              payment.payload.amount,
                              String(payment.payload.currency)
                            )
                          : "—"}
                      </td>
                      <td>{dateLabel(text(payment.payload.dueDate, ""))}</td>
                      <td>
                        <span
                          className={`ops-pill ${
                            ["overdue", "today"].includes(payment.dueBucket)
                              ? "alert"
                              : ""
                          }`}
                        >
                          {payment.dueBucket.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>{payment.overdueDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ops-empty">
              <strong>No payment rows returned</strong>Generated invoices will
              appear when the billing service returns them.
            </div>
          )}
        </section>
      )}

      {data.events.length > 0 && canSeeEvents && (
        <section className="ops-section span-12" aria-labelledby="events-title">
          <div className="ops-section-head">
            <div>
              <h2 id="events-title">Operations audit</h2>
            </div>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Subject</th>
                  <th>Time</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.events
                  .filter((event) => isOwner || event.actor === profileId)
                  .map((event) => (
                    <tr key={event.id}>
                      <td>{event.action}</td>
                      <td>{event.subject ?? "—"}</td>
                      <td>
                        {dateLabel(event.created_at, data.profile.timezone)}
                      </td>
                      <td>{event.notes}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
