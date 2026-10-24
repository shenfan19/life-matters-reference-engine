from fastapi import APIRouter

from src.solver import list_solvers

router = APIRouter()


@router.get("/api/solvers")
async def get_solvers():
    """The registered solvers and the capabilities each one declares."""
    return {"success": True, "solvers": list_solvers()}
