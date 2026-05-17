
import os
import re
import shutil
import git                          # this is the gitpython library
from backend.core.config import settings


def parse_github_url(url: str) -> tuple[str, str]:
    """
    Extract owner and repo name from a GitHub URL.
    
    "https://github.com/biswaisop/Genos"  →  ("biswaisop", "Genos")
    "https://github.com/biswaisop/Genos/" →  ("biswaisop", "Genos")  [trailing slash]
    """
    # re.search finds the pattern anywhere in the string
    # The pattern: /owner/repo at the end of the URL, optionally followed by /
    match = re.search(r'github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$', url.strip())
    if not match:
        raise ValueError(f"Not a valid GitHub URL: {url}")
    owner = match.group(1)
    name  = match.group(2)
    return owner, name


def clone_repo(repo_id: str, url: str) -> str:
    """
    Clone the GitHub repo to disk. Returns the local path.
    
    Raises an exception if the repo doesn't exist or is private.
    """
    # Where this repo will live on disk
    local_path = os.path.join(settings.repo_storage_path, repo_id)

    # If we already cloned it (maybe from a previous failed run), remove it first
    if os.path.exists(local_path):
        shutil.rmtree(local_path)

    os.makedirs(local_path, exist_ok=True)

    # git.Repo.clone_from is the same as running `git clone <url> <local_path>`
    # depth=1 means "only download the latest commit, not the full history"
    # This is MUCH faster — we don't need history, just the current files
    git.Repo.clone_from(
        url,
        local_path,
        depth=1,
    )

    return local_path


def get_python_files(local_path: str, max_files: int) -> list[str]:
    """
    Walk the cloned repo and return paths of all .py files.
    Skips: test files, migrations, __pycache__, hidden folders.
    
    Returns a list of absolute file paths.
    """
    python_files = []

    # os.walk goes through every folder and subfolder
    for root, dirs, files in os.walk(local_path):

        # MODIFY dirs IN-PLACE to skip certain folders
        # This tells os.walk to not even go into these directories
        dirs[:] = [
            d for d in dirs
            if d not in {'__pycache__', '.git', 'node_modules',
                         'venv', 'env', '.venv', 'migrations'}
            and not d.startswith('.')    # skip hidden folders like .github
        ]

        for file in files:
            if not file.endswith('.py'):
                continue
            if file.startswith('test_') or file.endswith('_test.py'):
                continue                # skip test files for now

            full_path = os.path.join(root, file)
            python_files.append(full_path)

            if len(python_files) >= max_files:
                return python_files     # stop if we hit the limit

    return python_files