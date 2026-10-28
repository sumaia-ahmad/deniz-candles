import click

from .extensions import db
from .models import User


@click.command("create-user")
@click.argument("username")
@click.option("--role", type=click.Choice(User.ROLES), default="admin", show_default=True)
@click.password_option()
def create_user_command(username, role, password):
    """Create a dashboard account (the password is asked for, never typed in the command)."""
    if db.session.scalar(db.select(User).where(User.username == username)):
        raise click.ClickException(f"User '{username}' already exists.")
    if len(password) < 8:
        raise click.ClickException("Password must be at least 8 characters.")

    user = User(username=username, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    click.echo(f"Created {role} account '{username}'.")


@click.command("reset-password")
@click.argument("username")
@click.password_option()
def reset_password_command(username, password):
    """Set a new password for an existing dashboard account."""
    user = db.session.scalar(db.select(User).where(User.username == username))
    if user is None:
        raise click.ClickException(f"No account named '{username}'.")
    if len(password) < 8:
        raise click.ClickException("Password must be at least 8 characters.")

    user.set_password(password)
    db.session.commit()
    click.echo(f"Password updated for '{username}'.")


@click.command("list-users")
def list_users_command():
    """Show the dashboard accounts (usernames and roles only)."""
    users = db.session.scalars(db.select(User).order_by(User.id)).all()
    if not users:
        click.echo("No accounts yet. Create one with: flask --app app create-user <username>")
    for user in users:
        click.echo(f"{user.username} ({user.role})")
