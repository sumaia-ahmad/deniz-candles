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
