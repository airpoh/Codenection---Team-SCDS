"""
FastAPI endpoints for ERC-4337 Smart Account integration
Add these endpoints to your main FastAPI app
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import subprocess
import json
import os

# Add these models and endpoints to your existing main.py

class SmartAccountRequest(BaseModel):
    signer_address: str
    chain_id: int = 80002

class BatchTransactionCall(BaseModel):
    to: str
    data: str
    value: Optional[str] = "0"

class BatchExecuteRequest(BaseModel):
    smart_account_address: str
    calls: List[BatchTransactionCall]
    chain_id: int
    bundler_url: str
    paymaster_api_key: str

class SmartAccountResponse(BaseModel):
    smart_account_address: str
    signer_address: str
    chain_id: int

class BatchExecuteResponse(BaseModel):
    user_op_hash: str
    transaction_hash: Optional[str]
    success: bool
    error: Optional[str]

# Add these endpoints to your existing FastAPI app

@app.post("/aa/get-smart-account", response_model=SmartAccountResponse)
async def get_smart_account_address(request: SmartAccountRequest):
    """
    Get or create a smart account address for a given signer
    """
    try:
        # For demo purposes, generate deterministic address
        # In production, this would interact with your AA factory contract

        # Simple deterministic address generation
        signer_bytes = request.signer_address[2:]  # Remove 0x
        # Replace first 2 characters with 'AA' to create smart account address
        smart_account_address = f"0xAA{signer_bytes[2:]}"

        return SmartAccountResponse(
            smart_account_address=smart_account_address,
            signer_address=request.signer_address,
            chain_id=request.chain_id
        )

    except Exception as e:
        raise HTTPException(500, f"Failed to get smart account: {str(e)}")

@app.post("/aa/execute-batch", response_model=BatchExecuteResponse)
async def execute_batch_transaction(request: BatchExecuteRequest):
    """
    Execute a batch of transactions via ERC-4337 UserOperation
    """
    try:
        # Get the directory of the Node.js AA test scripts
        aa_test_dir = os.path.join(os.path.dirname(__file__), "..", "aa-test")

        # Prepare the batch transaction data
        batch_data = {
            "smartAccountAddress": request.smart_account_address,
            "calls": [call.dict() for call in request.calls],
            "chainId": request.chain_id,
            "bundlerUrl": request.bundler_url,
            "paymasterApiKey": request.paymaster_api_key
        }

        # Write batch data to temporary file
        batch_file = os.path.join(aa_test_dir, "temp_batch.json")
        with open(batch_file, "w") as f:
            json.dump(batch_data, f)

        # Execute via Node.js script
        result = subprocess.run(
            ["node", "execute-batch-from-file.js", batch_file],
            cwd=aa_test_dir,
            capture_output=True,
            text=True,
            timeout=120
        )

        # Clean up temp file
        try:
            os.remove(batch_file)
        except:
            pass

        if result.returncode == 0:
            # Parse result from Node.js script
            output_lines = result.stdout.strip().split('\n')
            user_op_hash = None
            transaction_hash = None

            for line in output_lines:
                if "UserOpHash:" in line:
                    user_op_hash = line.split("UserOpHash:")[-1].strip()
                elif "TransactionHash:" in line:
                    transaction_hash = line.split("TransactionHash:")[-1].strip()

            return BatchExecuteResponse(
                user_op_hash=user_op_hash or "",
                transaction_hash=transaction_hash,
                success=True,
                error=None
            )
        else:
            error_msg = result.stderr or result.stdout
            return BatchExecuteResponse(
                user_op_hash="",
                transaction_hash=None,
                success=False,
                error=f"Batch execution failed: {error_msg}"
            )

    except subprocess.TimeoutExpired:
        return BatchExecuteResponse(
            user_op_hash="",
            transaction_hash=None,
            success=False,
            error="Batch execution timeout"
        )
    except Exception as e:
        return BatchExecuteResponse(
            user_op_hash="",
            transaction_hash=None,
            success=False,
            error=f"Execution error: {str(e)}"
        )

@app.post("/aa/wellness-redeem")
async def aa_wellness_redeem(body: dict):
    """
    Wellness-specific endpoint: Execute approve + redeem batch via Smart Account
    """
    try:
        # Extract parameters
        smart_account_address = body.get("smart_account_address")
        amount = float(body.get("amount", 0))
        reward_id = body.get("reward_id")

        if not all([smart_account_address, amount > 0, reward_id]):
            raise HTTPException(400, "Missing required parameters: smart_account_address, amount, reward_id")

        # Convert amount to wei
        amount_wei = int(amount * (10 ** 18))  # Assuming 18 decimals

        # Create batch calls for approve + redeem
        calls = [
            BatchTransactionCall(
                to=WELL_TOKEN_ADDRESS,
                data=encode_approve_call(REDEMPTION_ADDRESS, str(amount_wei))
            ),
            BatchTransactionCall(
                to=REDEMPTION_ADDRESS,
                data=encode_redeem_call(reward_id, str(amount_wei))
            )
        ]

        # Execute batch
        batch_request = BatchExecuteRequest(
            smart_account_address=smart_account_address,
            calls=calls,
            chain_id=80002,
            bundler_url=os.getenv("BICONOMY_BUNDLER_URL"),
            paymaster_api_key=os.getenv("BICONOMY_PAYMASTER_API_KEY")
        )

        result = await execute_batch_transaction(batch_request)

        return {
            "method": "ERC-4337-SmartAccount",
            "user_op_hash": result.user_op_hash,
            "transaction_hash": result.transaction_hash,
            "success": result.success,
            "amount": amount,
            "reward_id": reward_id,
            "explorer": f"https://amoy.polygonscan.com/tx/{result.transaction_hash}" if result.transaction_hash else None
        }

    except Exception as e:
        raise HTTPException(500, f"Wellness redeem failed: {str(e)}")

def encode_approve_call(spender: str, amount: str) -> str:
    """Encode ERC-20 approve function call"""
    # approve(address,uint256) = 0x095ea7b3
    function_selector = "095ea7b3"
    spender_padded = spender[2:].lower().ljust(64, '0')
    amount_hex = hex(int(amount))[2:].rjust(64, '0')
    return f"0x{function_selector}{spender_padded}{amount_hex}"

def encode_redeem_call(reward_id: str, amount: str) -> str:
    """Encode redemption function call"""
    # This is simplified - in production, use proper ABI encoding
    # For now, call the Node.js script to handle complex encoding
    return f"redeem_encoded_{reward_id}_{amount}"  # Placeholder

# Example usage:
"""
# Test Smart Account creation
curl -X POST http://localhost:8000/aa/get-smart-account \
  -H "Content-Type: application/json" \
  -d '{"signer_address": "0x76d8CfF46209a8969389c3ff4d48ec36cc47241C", "chain_id": 80002}'

# Test wellness redemption
curl -X POST http://localhost:8000/aa/wellness-redeem \
  -H "Content-Type: application/json" \
  -d '{"smart_account_address": "0xAA...", "amount": 5.0, "reward_id": "coffee_voucher"}'
"""