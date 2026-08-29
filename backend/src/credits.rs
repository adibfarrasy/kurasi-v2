use uuid::Uuid;

pub async fn grant_signup_credits(pool: &sqlx::PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    let existing = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM credit_grant WHERE user_id=$1 AND source='signup' LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if existing.is_some() {
        return Ok(());
    }
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE credit_account SET balance=balance+15 WHERE user_id=$1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO credit_grant (id, user_id, amount, source) VALUES (gen_random_uuid(), $1, 15, 'signup')",
    )
    .bind(user_id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    tracing::info!(user_id, "granted signup credits");
    Ok(())
}